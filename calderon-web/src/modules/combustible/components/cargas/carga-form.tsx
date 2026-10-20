'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm, type Path } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Gauge, LoaderCircle } from 'lucide-react';
import { useSesion } from '@/modules/core/session/session-provider';
import type { ErrorAccion } from '@/server/actions/result';
import { cn } from '@/shared/lib/cn';
import { formatearNumero } from '@/shared/lib/numeros';
import { formatearFechaHora, horaLocalAIso, isoAHoraLocal } from '@/shared/lib/fechas';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { cargaFormSchema, type CargaFormEntrada } from '../../domain/carga.schemas';
import { ETIQUETA_MEDIO_PAGO, MEDIOS_PAGO, type Carga, type MedioPago } from '../../domain/carga.types';
import { useCamionesCombustible, useChoferesCombustible, useCrearCarga, useEditarCarga, useEstaciones, useMonedas, useOdometroTelemetria } from '../../queries/hooks';
import { CLASE_TEXTAREA, ErrorBase } from '../comun/ui';

type Salida = ReturnType<typeof cargaFormSchema.parse>;

/**
 * Alta de carga. Desde la migración 26 el camión es un solo volumen: no importa a qué
 * tanque fue (la mochila es un tanque más). Si una combinación no es válida (corte que no
 * es llenado, faltante sin observación, período cerrado…) la base la rechaza y se muestra
 * su mensaje.
 * Con `carga` es la edición (migración 47): se corrige en el lugar; el camión no cambia.
 * El odómetro se propone desde la telemetría a la fecha y hora de la carga.
 */
export function CargaForm({ camionInicial, reemplazaId, carga }: { camionInicial: number | null; reemplazaId: number | null; carga?: Carga }) {
  const router = useRouter();
  const { zonaHoraria, monedaBase } = useSesion();
  const crear = useCrearCarga();
  const editar = useEditarCarga();
  const txt = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v).replace('.', ','));
  const [error, setError] = useState<ErrorAccion | null>(null);
  const { data: camiones } = useCamionesCombustible();
  const { data: estaciones } = useEstaciones();
  const { data: choferes } = useChoferesCombustible();
  const { data: monedas } = useMonedas();

  const form = useForm<CargaFormEntrada, unknown, Salida>({
    resolver: zodResolver(cargaFormSchema),
    defaultValues: carga
      ? {
          camionId: String(carga.camionId),
          choferId: carga.choferId ? String(carga.choferId) : '',
          estacionId: carga.estacionId ? String(carga.estacionId) : '',
          fechaHoraLocal: isoAHoraLocal(carga.fechaHora, zonaHoraria),
          litros: txt(carga.litros),
          precioUnitario: txt(carga.precioUnitario),
          moneda: carga.moneda,
          medioPago: carga.medioPago as MedioPago,
          odometroKm: txt(carga.odometroKm),
          tanqueLleno: carga.tanqueLleno,
          esFrontera: carga.esFrontera,
          faltanteLlenoL: carga.faltanteLlenoL ? txt(carga.faltanteLlenoL) : '',
          faltanteObservacion: carga.faltanteObservacion ?? '',
        }
      : {
          camionId: camionInicial ? String(camionInicial) : '',
          choferId: '',
          estacionId: '',
          fechaHoraLocal: isoAHoraLocal(new Date().toISOString(), zonaHoraria),
          litros: '',
          precioUnitario: '',
          moneda: monedaBase ?? '',
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
  // Solo para mostrar: la base calcula y guarda el importe (litros × precio).
  const aNumero = (v: unknown) => {
    const t = String(v ?? '').trim().replace(',', '.');
    return t === '' || Number.isNaN(Number(t)) ? null : Number(t);
  };
  const litrosN = aNumero(watch('litros'));
  const precioN = aNumero(watch('precioUnitario'));
  const importe = litrosN !== null && precioN !== null ? Math.round(litrosN * precioN * 100) / 100 : null;

  // En la edición, cuando llegan las listas se vuelve a poner lo de la carga (sin pisar lo que ya se cambió).
  const listas = Boolean(estaciones && monedas && choferes);
  useEffect(() => {
    if (carga && listas) form.reset(form.formState.defaultValues as CargaFormEntrada, { keepDirtyValues: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando terminan de llegar las listas
  }, [listas]);

  useEffect(() => {
    if (!tanqueLleno) setValue('esFrontera', false);
  }, [tanqueLleno, setValue]);

  // Odómetro de la telemetría a la fecha y hora de la carga: se completa solo si el campo está vacío
  // o si lo había puesto la telemetría (nunca pisa lo que escribió el usuario).
  const fechaLocal = watch('fechaHoraLocal');
  const fechaIso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(fechaLocal ?? '') ? horaLocalAIso(fechaLocal, zonaHoraria) : null;
  const telemetria = useOdometroTelemetria(camionId, fechaIso);
  const [odometroAuto, setOdometroAuto] = useState<string | null>(null);
  const odometro = watch('odometroKm');
  useEffect(() => {
    const km = telemetria.data?.km;
    if (km === undefined) return;
    const valor = String(km).replace('.', ',');
    if (odometro === '' || odometro === odometroAuto) {
      setValue('odometroKm', valor, { shouldValidate: true });
      setOdometroAuto(valor);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando llega una lectura nueva
  }, [telemetria.data]);

  const enviar = handleSubmit(async (d) => {
    setError(null);
    const fechaHora = horaLocalAIso(d.fechaHoraLocal, zonaHoraria);
    if (!fechaHora || !camion) {
      setError({ codigo: 'validacion', mensaje: 'Revisá el camión y la fecha.' });
      return;
    }
    if (carga) {
      const r = await editar.mutateAsync({
        cargaId: carga.id,
        versionFila: carga.versionFila,
        choferId: d.choferId,
        estacionId: d.estacionId,
        fechaHora,
        litros: d.litros ?? 0,
        precioUnitario: d.precioUnitario ?? 0,
        moneda: d.moneda,
        medioPago: d.medioPago,
        odometroKm: d.odometroKm,
        tanqueLleno: d.tanqueLleno,
        esFrontera: d.esFrontera,
        faltanteLlenoL: d.esFrontera ? d.faltanteLlenoL : 0,
        faltanteObservacion: d.esFrontera ? d.faltanteObservacion : null,
        motivo: null,
      });
      if (!r.ok) {
        setError(r.error);
        for (const [campo, mensaje] of Object.entries(r.error.campos ?? {})) {
          form.setError(campo as Path<CargaFormEntrada>, { type: 'server', message: mensaje });
        }
        return;
      }
      router.push(`/combustible/cargas/${carga.id}`);
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
      importeOriginal: Math.round((d.litros ?? 0) * (d.precioUnitario ?? 0) * 100) / 100,
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
      <Link href={carga ? `/combustible/cargas/${carga.id}` : '/combustible/cargas'} className="inline-flex items-center gap-1 text-sm text-tinta-suave hover:text-tinta">
        <ArrowLeft className="size-4" /> {carga ? `Carga #${carga.id}` : 'Cargas'}
      </Link>
      <header>
        <p className="text-sm text-tinta-suave">Combustible</p>
        <h1 className="text-2xl font-semibold text-tinta">
          {carga ? `Editar la carga #${carga.id}` : reemplazaId ? `Carga que reemplaza a la #${reemplazaId}` : 'Nueva carga'}
        </h1>
        {carga && <p className="mt-1 text-sm text-tinta-suave">Se corrige sobre la misma carga. Queda registrado quién cambió qué.</p>}
      </header>

      <ErrorBase error={error} />

      <section className={cn(TARJETA, 'grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3')} aria-label="Datos de la carga">
        {carga && <input type="hidden" {...register('camionId')} />}
        <Campo label="Camión *" error={e.camionId?.message} {...(carga ? { ayuda: 'El camión no se cambia: si es otro, eliminá la carga y cargala de nuevo.' } : {})}>
          {carga ? (
            <input readOnly className="bg-fondo" value={camion ? `${camion.codigoInterno} · ${camion.patente}` : (carga.camionPatente ?? `#${carga.camionId}`)} />
          ) : (
            <select {...register('camionId')}>
              <option value="">Elegí…</option>
              {camiones?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigoInterno} · {c.patente}
                </option>
              ))}
            </select>
          )}
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
        <Campo
          label="Estación *"
          error={e.estacionId?.message}
          {...(estaciones && estaciones.length === 0 ? { ayuda: 'No hay estaciones cargadas: dalas de alta en Comercial > Estaciones de servicio.' } : {})}
        >
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
        <Campo
          label="Odómetro (km)"
          error={e.odometroKm?.message}
          ayuda={
            !camionId || !fechaIso
              ? 'Elegí el camión y la fecha: se trae de la telemetría.'
              : telemetria.isFetching
                ? 'Buscando en la telemetría…'
                : telemetria.data
                  ? `Telemetría: ${formatearNumero(telemetria.data.km, 1)} km a las ${formatearFechaHora(telemetria.data.ts, zonaHoraria)}.`
                  : 'Sin lectura de telemetría cerca de esa hora: cargalo a mano.'
          }
        >
          <div className="relative">
            <input inputMode="decimal" {...register('odometroKm')} />
            {odometroAuto !== null && odometro === odometroAuto && (
              <Gauge className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-marca" aria-label="De la telemetría" />
            )}
          </div>
        </Campo>
        <Campo label="Precio unitario *" error={e.precioUnitario?.message}>
          <input inputMode="decimal" {...register('precioUnitario')} />
        </Campo>
        <Campo label="Moneda *" error={e.moneda?.message} ayuda="En otra moneda, la cotización de ese día tiene que estar cargada (Finanzas > Tipos de cambio).">
          <select {...register('moneda')}>
            <option value="">Elegí…</option>
            {monedas?.map((m) => (
              <option key={m.codigo} value={m.codigo}>
                {m.codigo} · {m.nombre}
              </option>
            ))}
          </select>
        </Campo>
        <div className="grid content-start gap-1 text-sm">
          <span className="font-medium text-tinta">Importe</span>
          <span className="flex h-10 items-center rounded-md border border-borde bg-fondo px-3 tabular-nums">
            {importe === null ? '—' : `${formatearNumero(importe)} ${watch('moneda') || ''}`}
          </span>
          <span className="text-xs text-tinta-suave">Litros × precio unitario (lo calcula el sistema).</span>
        </div>
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
                Este llenado termina un viaje y empieza el siguiente. Si te olvidaste, se puede marcar después con «Editar».
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
        <button type="submit" className={BOTON_PRIMARIO} disabled={crear.isPending || editar.isPending}>
          {(crear.isPending || editar.isPending) && <LoaderCircle className="size-4 animate-spin" />} {carga ? 'Guardar cambios' : 'Registrar carga'}
        </button>
        <Link href={carga ? `/combustible/cargas/${carga.id}` : '/combustible/cargas'} className={BOTON_SECUNDARIO}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
