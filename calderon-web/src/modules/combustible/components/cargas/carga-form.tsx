'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm, type Path } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, LoaderCircle } from 'lucide-react';
import { useSesion } from '@/modules/core/session/session-provider';
import type { ErrorAccion } from '@/server/actions/result';
import { cn } from '@/shared/lib/cn';
import { horaLocalAIso, isoAHoraLocal } from '@/shared/lib/fechas';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { cargaFormSchema, type CargaFormEntrada } from '../../domain/carga.schemas';
import { ETIQUETA_MEDIO_PAGO, MEDIOS_PAGO } from '../../domain/carga.types';
import { useCamionesCombustible, useChoferesCombustible, useCrearCarga, useEstaciones, useMonedas } from '../../queries/hooks';
import { CLASE_TEXTAREA, ErrorBase } from '../comun/ui';

type Salida = ReturnType<typeof cargaFormSchema.parse>;

/**
 * Alta de carga. Desde la migración 26 el camión es un solo volumen: no importa a qué
 * tanque fue (la mochila es un tanque más). Si una combinación no es válida (corte que no
 * es llenado, faltante sin observación, período cerrado…) la base la rechaza y se muestra
 * su mensaje.
 */
export function CargaForm({ camionInicial, reemplazaId }: { camionInicial: number | null; reemplazaId: number | null }) {
  const router = useRouter();
  const { zonaHoraria, monedaBase } = useSesion();
  const crear = useCrearCarga();
  const [error, setError] = useState<ErrorAccion | null>(null);
  const { data: camiones } = useCamionesCombustible();
  const { data: estaciones } = useEstaciones();
  const { data: choferes } = useChoferesCombustible();
  const { data: monedas } = useMonedas();

  const form = useForm<CargaFormEntrada, unknown, Salida>({
    resolver: zodResolver(cargaFormSchema),
    defaultValues: {
      camionId: camionInicial ? String(camionInicial) : '',
      choferId: '',
      estacionId: '',
      fechaHoraLocal: isoAHoraLocal(new Date().toISOString(), zonaHoraria),
      litros: '',
      precioUnitario: '',
      moneda: monedaBase ?? '',
      importeOriginal: '',
      medioPago: 'tarjeta',
      odometroKm: '',
      tanqueLleno: false,
      esFrontera: false,
      faltanteLlenoL: '',
      faltanteObservacion: '',
    },
    mode: 'onTouched',
  });
  const { register, handleSubmit, watch, setValue, formState } = form;
  const e = formState.errors;
  const camionId = Number(watch('camionId')) || null;
  const tanqueLleno = watch('tanqueLleno');
  const esCorte = watch('esFrontera');
  const camion = camiones?.find((c) => c.id === camionId);

  useEffect(() => {
    if (!tanqueLleno) setValue('esFrontera', false);
  }, [tanqueLleno, setValue]);

  const enviar = handleSubmit(async (d) => {
    setError(null);
    const fechaHora = horaLocalAIso(d.fechaHoraLocal, zonaHoraria);
    if (!fechaHora || !camion) {
      setError({ codigo: 'validacion', mensaje: 'Revisá el camión y la fecha.' });
      return;
    }
    const r = await crear.mutateAsync({
      camionId: d.camionId,
      choferId: d.choferId,
      estacionId: d.estacionId,
      fechaHora,
      tipoCombustibleId: camion.tipoCombustibleId,
      litros: d.litros ?? 0,
      precioUnitario: d.precioUnitario ?? 0,
      moneda: d.moneda,
      importeOriginal: d.importeOriginal ?? 0,
      medioPago: d.medioPago,
      odometroKm: d.odometroKm,
      tanqueLleno: d.tanqueLleno,
      esFrontera: d.esFrontera,
      faltanteLlenoL: d.esFrontera ? d.faltanteLlenoL : 0,
      faltanteObservacion: d.esFrontera ? d.faltanteObservacion : null,
      anulaId: reemplazaId,
    });
    if (!r.ok) {
      setError(r.error);
      for (const [campo, mensaje] of Object.entries(r.error.campos ?? {})) {
        form.setError(campo as Path<CargaFormEntrada>, { type: 'server', message: mensaje });
      }
      return;
    }
    router.push(`/combustible/cargas/${r.data}`);
  });

  return (
    <form onSubmit={enviar} noValidate className="space-y-5">
      <Link href="/combustible/cargas" className="inline-flex items-center gap-1 text-sm text-tinta-suave hover:text-tinta">
        <ArrowLeft className="size-4" /> Cargas
      </Link>
      <header>
        <p className="text-sm text-tinta-suave">Combustible</p>
        <h1 className="text-2xl font-semibold text-tinta">{reemplazaId ? `Carga que reemplaza a la #${reemplazaId}` : 'Nueva carga'}</h1>
      </header>

      <ErrorBase error={error} />

      <section className={cn(TARJETA, 'grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3')} aria-label="Datos de la carga">
        <Campo label="Camión *" error={e.camionId?.message}>
          <select {...register('camionId')}>
            <option value="">Elegí…</option>
            {camiones?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigoInterno} · {c.patente}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Chofer" error={e.choferId?.message}>
          <select {...register('choferId')}>
            <option value="">Sin informar</option>
            {choferes?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Estación *" error={e.estacionId?.message}>
          <select {...register('estacionId')}>
            <option value="">Elegí…</option>
            {estaciones?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre} ({s.pais}){s.esTanquePropio ? ' · surtidor propio' : ''}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Fecha y hora *" error={e.fechaHoraLocal?.message} ayuda={`Hora de ${zonaHoraria}`}>
          <input type="datetime-local" {...register('fechaHoraLocal')} />
        </Campo>
        <Campo label="Litros *" error={e.litros?.message}>
          <input inputMode="decimal" {...register('litros')} />
        </Campo>
        <Campo label="Odómetro (km)" error={e.odometroKm?.message}>
          <input inputMode="decimal" {...register('odometroKm')} />
        </Campo>
        <Campo label="Precio unitario *" error={e.precioUnitario?.message}>
          <input inputMode="decimal" {...register('precioUnitario')} />
        </Campo>
        <Campo label="Moneda *" error={e.moneda?.message}>
          <select {...register('moneda')}>
            <option value="">Elegí…</option>
            {monedas?.map((m) => (
              <option key={m.codigo} value={m.codigo}>
                {m.codigo} · {m.nombre}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Importe *" error={e.importeOriginal?.message}>
          <input inputMode="decimal" {...register('importeOriginal')} />
        </Campo>
        <Campo label="Medio de pago *" error={e.medioPago?.message}>
          <select {...register('medioPago')}>
            {MEDIOS_PAGO.map((m) => (
              <option key={m} value={m}>
                {ETIQUETA_MEDIO_PAGO[m]}
              </option>
            ))}
          </select>
        </Campo>
      </section>

      <section className={cn(TARJETA, 'space-y-4 p-5')} aria-label="Llenado y corte de viaje">
        <p className="text-sm text-tinta-suave">
          Registrá el total cargado al camión, sin importar a qué tanque fue (principal, secundario o mochila).
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-marca" {...register('tanqueLleno')} /> Tanque lleno
        </label>
        {tanqueLleno && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 accent-marca" {...register('esFrontera')} />
            <span>
              <span className="font-medium">Corte de viaje</span>
              <span className="block text-xs text-tinta-suave">
                Este llenado termina un viaje y empieza el siguiente. No se puede cambiar después: se corrige anulando la carga.
              </span>
            </span>
          </label>
        )}
        {tanqueLleno && esCorte && (
          <div className="grid gap-4 sm:grid-cols-[minmax(0,14rem)_1fr]">
            <Campo
              label="Le faltaron (L) para quedar lleno"
              error={e.faltanteLlenoL?.message}
              ayuda="0 si quedó todo lleno. Dato del surtidor."
            >
              <input inputMode="decimal" placeholder="0" {...register('faltanteLlenoL')} />
            </Campo>
            <label className="block space-y-1.5">
              <span className="block text-sm font-medium text-tinta">Observación (si le faltaron litros)</span>
              <textarea rows={2} className={CLASE_TEXTAREA} placeholder="Qué tanque quedó sin llenar y por qué" {...register('faltanteObservacion')} />
              {e.faltanteObservacion?.message && <span className="block text-xs text-error">{e.faltanteObservacion.message}</span>}
            </label>
          </div>
        )}
      </section>

      <div className="flex flex-wrap gap-3">
        <button type="submit" className={BOTON_PRIMARIO} disabled={crear.isPending}>
          {crear.isPending && <LoaderCircle className="size-4 animate-spin" />} Registrar carga
        </button>
        <Link href="/combustible/cargas" className={BOTON_SECUNDARIO}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
