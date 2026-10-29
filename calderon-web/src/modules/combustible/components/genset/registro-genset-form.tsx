'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, type Path } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { LoaderCircle } from 'lucide-react';
import { useGensets } from '@/modules/pizarra/queries/hooks';
import { useSesion } from '@/modules/core/session/session-provider';
import type { ErrorAccion } from '@/server/actions/result';
import { cn } from '@/shared/lib/cn';
import { horaLocalAIso, isoAHoraLocal } from '@/shared/lib/fechas';
import { borrarBorrador, guardarBorrador, leerBorrador } from '@/shared/lib/local';
import { formatearNumero } from '@/shared/lib/numeros';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { registroGensetFormSchema, type RegistroGensetFormEntrada } from '../../domain/genset.schemas';
import { useCamionesCombustible, useChoferesCombustible, useEstaciones, useMonedas, useRegistrarGenset, useTanquesBase } from '../../queries/hooks';
import { CLASE_TEXTAREA, ErrorBase } from '../comun/ui';

type Salida = ReturnType<typeof registroGensetFormSchema.parse>;

/**
 * Carga de combustible al genset o descarga al tanque de base (migración 48). El chofer y el
 * horómetro son obligatorios al cargar: el chofer queda como responsable de la vuelta.
 * Las reglas (horómetro que no va para atrás, momentos ya cerrados…) las aplica la base.
 */
export function RegistroGensetForm({
  gensetInicial,
  tipoInicial,
  onListo,
  onCancelar,
}: {
  gensetInicial: number | null;
  tipoInicial: 'carga' | 'descarga';
  onListo?: (gensetId: number) => void;
  onCancelar?: () => void;
}) {
  const router = useRouter();
  const { zonaHoraria, monedaBase } = useSesion();
  const registrar = useRegistrarGenset();
  const { data: gensets } = useGensets();
  const { data: choferes } = useChoferesCombustible();
  const { data: camiones } = useCamionesCombustible();
  const { data: estaciones } = useEstaciones();
  const { data: monedas } = useMonedas();
  const { data: tanques } = useTanquesBase();
  const [error, setError] = useState<ErrorAccion | null>(null);
  const form = useForm<RegistroGensetFormEntrada, unknown, Salida>({
    resolver: zodResolver(registroGensetFormSchema),
    defaultValues: {
      gensetId: gensetInicial ? String(gensetInicial) : '',
      tipo: tipoInicial,
      fechaHoraLocal: isoAHoraLocal(new Date().toISOString(), zonaHoraria),
      litros: '',
      horometroH: '',
      tanqueLleno: true,
      vacio: true,
      choferId: '',
      camionId: '',
      estacionId: '',
      precioUnitario: '',
      moneda: monedaBase ?? '',
      ticketNumero: '',
      depositoId: '',
      observacion: '',
    },
    mode: 'onTouched',
  });
  const { register, handleSubmit, watch, formState } = form;
  // Lo escrito se guarda en la pestaña mientras se completa: si la página se recarga sola, no se pierde.
  const claveBorrador = `borrador-genset-${tipoInicial}-${gensetInicial ?? 'nuevo'}`;
  const [recuperado, setRecuperado] = useState(false);
  // Hasta que la página no terminó de cargar, el botón no se puede apretar: si no, el navegador manda el
  // formulario por su cuenta, recarga la página en blanco y no guarda nada.
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  // Cuando llegan las listas se vuelven a poner los valores iniciales (sin pisar lo que ya se escribió),
  // o lo que había quedado a medio cargar.
  const listas = Boolean(gensets && monedas && choferes);
  useEffect(() => {
    if (!listas) return;
    const borrador = leerBorrador<RegistroGensetFormEntrada>(claveBorrador);
    if (borrador && (borrador.litros || borrador.horometroH)) {
      form.reset({ ...(form.formState.defaultValues as RegistroGensetFormEntrada), ...borrador });
      setRecuperado(true);
    } else form.reset(form.formState.defaultValues as RegistroGensetFormEntrada, { keepDirtyValues: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando terminan de llegar las listas
  }, [listas]);
  useEffect(() => {
    if (!listas) return;
    const sub = form.watch((v) => guardarBorrador(claveBorrador, v));
    return () => sub.unsubscribe();
  }, [listas, form, claveBorrador]);
  const e = formState.errors;
  const tipo = watch('tipo');
  const carga = tipo === 'carga';
  const aNumero = (v: unknown) => {
    const t = String(v ?? '').trim().replace(',', '.');
    return t === '' || Number.isNaN(Number(t)) ? null : Number(t);
  };
  const litros = aNumero(watch('litros'));
  const precio = aNumero(watch('precioUnitario'));
  const genset = gensets?.find((g) => g.id === Number(watch('gensetId')));

  const enviar = handleSubmit(async (d) => {
    setError(null);
    const fechaHora = horaLocalAIso(d.fechaHoraLocal, zonaHoraria);
    if (!fechaHora) {
      setError({ codigo: 'validacion', mensaje: 'Revisá la fecha y la hora.' });
      return;
    }
    let r: Awaited<ReturnType<typeof registrar.mutateAsync>>;
    try {
      r = await registrar.mutateAsync({
      gensetId: d.gensetId,
      tipo: d.tipo,
      fechaHora,
      litros: d.litros ?? 0,
      horometroH: d.horometroH ?? 0,
      tanqueLleno: d.tanqueLleno,
      vacio: d.vacio,
      choferId: d.choferId,
      camionId: d.camionId,
      estacionId: d.estacionId,
      precioUnitario: d.precioUnitario,
      moneda: d.moneda || null,
      ticketNumero: d.ticketNumero,
      depositoId: d.depositoId,
      observacion: d.observacion,
      });
    } catch {
      // Se cortó la conexión o el sistema se actualizó: lo escrito queda en pantalla para reintentar.
      setError({ codigo: 'desconocido', mensaje: 'No se pudo guardar: se cortó la conexión con el sistema. Tus datos siguen acá; volvé a apretar «Registrar». Si se repite, recargá la página (los datos se recuperan).' });
      return;
    }
    if (!r.ok) {
      setError(r.error);
      for (const [campo, mensaje] of Object.entries(r.error.campos ?? {})) form.setError(campo as Path<RegistroGensetFormEntrada>, { type: 'server', message: mensaje });
      return;
    }
    borrarBorrador(claveBorrador);
    if (onListo) onListo(d.gensetId);
    else router.push(`/flota/gensets/${d.gensetId}`);
  });

  return (
    <form onSubmit={enviar} noValidate className="space-y-4">
      {recuperado && (
        <p className="rounded-lg bg-marca-suave p-3 text-sm text-marca">
          Recuperamos lo que estabas cargando (la página se había recargado). Revisalo y apretá «Registrar».
        </p>
      )}
      <ErrorBase error={error} />
      <div className="inline-flex rounded-lg border border-borde bg-panel p-1" role="radiogroup" aria-label="Qué se registra">
        {(['carga', 'descarga'] as const).map((t) => (
          <label key={t} className={cn('cursor-pointer rounded-md px-3 py-1.5 text-sm', tipo === t ? 'bg-marca text-white' : 'text-tinta hover:bg-hover')}>
            <input type="radio" value={t} className="sr-only" {...register('tipo')} />
            {t === 'carga' ? 'Carga al genset' : 'Descarga en la base'}
          </label>
        ))}
      </div>

      <section className={cn(TARJETA, 'grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3')} aria-label="Datos">
        <Campo label="Genset *" error={e.gensetId?.message} {...(genset?.semiPatente ? { ayuda: `Instalado en el semi ${genset.semiPatente}.` } : {})}>
          <select {...register('gensetId')}>
            <option value="">Elegí…</option>
            {gensets
              ?.filter((g) => g.estado === 'activo')
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {g.codigo}
                  {g.semiPatente ? ` · semi ${g.semiPatente}` : ''}
                </option>
              ))}
          </select>
        </Campo>
        <Campo label="Fecha y hora *" error={e.fechaHoraLocal?.message} ayuda={`Hora de ${zonaHoraria}`}>
          <input type="datetime-local" {...register('fechaHoraLocal')} />
        </Campo>
        <Campo label="Horómetro (h) *" error={e.horometroH?.message} ayuda="Las horas que marca el genset en este momento.">
          <input inputMode="decimal" {...register('horometroH')} />
        </Campo>
        <Campo label={carga ? 'Litros cargados *' : 'Litros descargados *'} error={e.litros?.message}>
          <input inputMode="decimal" {...register('litros')} />
        </Campo>
        <Campo label={carga ? 'Chofer *' : 'Chofer'} error={e.choferId?.message} {...(carga ? { ayuda: 'Queda como responsable del combustible del genset.' } : {})}>
          <select {...register('choferId')}>
            <option value="">{carga ? 'Elegí…' : 'Sin informar'}</option>
            {choferes?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </Campo>
        {carga ? (
          <>
            <Campo label="Tractor" error={e.camionId?.message}>
              <select {...register('camionId')}>
                <option value="">Sin informar</option>
                {camiones?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.codigoInterno} · {c.patente}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Estación *" error={e.estacionId?.message}>
              <select {...register('estacionId')}>
                <option value="">Elegí…</option>
                {estaciones?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre} ({s.pais})
                  </option>
                ))}
              </select>
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
            <div className="grid content-start gap-1 text-sm">
              <span className="font-medium text-tinta">Importe</span>
              <span className="flex h-10 items-center rounded-md border border-borde bg-fondo px-3 tabular-nums">
                {litros !== null && precio !== null ? `${formatearNumero(Math.round(litros * precio * 100) / 100)} ${watch('moneda') || ''}` : '—'}
              </span>
            </div>
            <Campo label="N.º de ticket (opcional)" error={e.ticketNumero?.message}>
              <input maxLength={60} {...register('ticketNumero')} />
            </Campo>
          </>
        ) : (
          <Campo label="Tanque de base *" error={e.depositoId?.message}>
            <select {...register('depositoId')}>
              {(tanques?.length ?? 0) !== 1 && <option value="">Elegí…</option>}
              {tanques?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </Campo>
        )}
      </section>

      <section className={cn(TARJETA, 'space-y-3 p-5')}>
        {carga ? (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 accent-marca" {...register('tanqueLleno')} />
            <span>
              <span className="font-medium">Tanque lleno</span>
              <span className="block text-xs text-tinta-suave">Cierra la vuelta anterior del genset y empieza una nueva con este chofer.</span>
            </span>
          </label>
        ) : (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 accent-marca" {...register('vacio')} />
            <span>
              <span className="font-medium">Quedó vacío</span>
              <span className="block text-xs text-tinta-suave">Se descargó todo: cierra la vuelta del genset (hace falta su capacidad).</span>
            </span>
          </label>
        )}
        <label className="block space-y-1.5">
          <span className="block text-sm font-medium text-tinta">Observación</span>
          <textarea rows={2} className={CLASE_TEXTAREA} {...register('observacion')} />
        </label>
      </section>

      <div className="flex flex-wrap gap-3">
        <button type="submit" className={BOTON_PRIMARIO} disabled={!montado || !listas || registrar.isPending}>
          {registrar.isPending && <LoaderCircle className="size-4 animate-spin" />} {carga ? 'Registrar carga' : 'Registrar descarga'}
        </button>
        {onCancelar && (
          <button type="button" className={BOTON_SECUNDARIO} onClick={onCancelar}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
