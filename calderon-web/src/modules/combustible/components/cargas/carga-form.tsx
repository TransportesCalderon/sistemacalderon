'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm, type Path } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Camera, Gauge, LoaderCircle } from 'lucide-react';
import { AvisoIA } from '@/modules/ia/aviso-ia';
import { useLectorIA } from '@/modules/ia/use-lector-ia';
import { idAleatorio, prepararArchivo, sha256Hex } from '@/shared/lib/archivo';
import { browserDb } from '@/shared/supabase/browser';
import { BUCKET_DOCUMENTOS, rutaArchivo } from '../../domain/documento.types';
import { useSesion } from '@/modules/core/session/session-provider';
import type { ErrorAccion } from '@/server/actions/result';
import { cn } from '@/shared/lib/cn';
import { formatearNumero } from '@/shared/lib/numeros';
import { formatearFechaHora, horaLocalAIso, hoyEnZona, isoAHoraLocal } from '@/shared/lib/fechas';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { cargaFormSchema, type CargaFormEntrada } from '../../domain/carga.schemas';
import { ETIQUETA_MEDIO_PAGO, MEDIOS_PAGO, type Carga, type MedioPago } from '../../domain/carga.types';
import {
  useAdjuntarDocumento,
  useCamionesCombustible,
  useChoferDeTractor,
  useChoferesCombustible,
  useCrearCarga,
  useEditarCarga,
  useEmisorTicket,
  useEstaciones,
  useMonedas,
  useOdometroTelemetria,
} from '../../queries/hooks';
import { CLASE_TEXTAREA, ErrorBase } from '../comun/ui';
import { DestinoCargaSelector } from './destino-carga';

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
          fechaHoraLocal: '',
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
    if (telemetria.isFetching || telemetria.data === undefined) return;
    const puesto = odometro === '' || odometro === odometroAuto;
    if (!puesto) return;
    if (telemetria.data === null) {
      // Para esa fecha no hay lectura: se borra el que había puesto la telemetría para otra hora
      if (odometroAuto !== null) setValue('odometroKm', '', { shouldValidate: false });
      setOdometroAuto(null);
      return;
    }
    const valor = String(telemetria.data.km).replace('.', ',');
    setValue('odometroKm', valor, { shouldValidate: true });
    setOdometroAuto(valor);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando llega la lectura de otra fecha o camión
  }, [telemetria.data, telemetria.isFetching]);

  // Chofer fijo del tractor a la fecha de la carga: se propone si no se eligió otro
  const choferTractor = useChoferDeTractor(camionId, fechaIso ? fechaLocal.slice(0, 10) : hoyEnZona(zonaHoraria));
  const [choferAuto, setChoferAuto] = useState<string | null>(null);
  const chofer = watch('choferId');
  useEffect(() => {
    if (carga || choferTractor.data === undefined || !choferes) return;
    if (chofer !== '' && chofer !== choferAuto) return;
    const valor = choferTractor.data === null ? '' : String(choferTractor.data);
    setValue('choferId', valor);
    setChoferAuto(valor === '' ? null : valor);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cuando cambia el tractor o la fecha
  }, [choferTractor.data, choferes]);

  // Migración 64: foto del ticket leída con IA (solo en el alta y si la IA está activada).
  // La IA propone; la persona revisa el formulario y guarda como siempre.
  const lector = useLectorIA('ticket_combustible');
  const adjuntar = useAdjuntarDocumento();
  const [fotoTicket, setFotoTicket] = useState<File | null>(null);
  const emisor = useEmisorTicket(Number(watch('estacionId')) || null);
  const conIA = !carga && lector.disponible;
  const leerTicket = async (archivo: File) => {
    setFotoTicket(archivo);
    const r = await lector.leer(archivo);
    if (!r) return;
    const p = r.propuesta;
    const op = { shouldValidate: true, shouldDirty: true } as const;
    if (p.camion_id && !watch('camionId')) setValue('camionId', String(p.camion_id), op);
    if (p.estacion_id) setValue('estacionId', String(p.estacion_id), op);
    if (p.fecha) setValue('fechaHoraLocal', `${p.fecha}T${p.hora ?? '12:00'}`, op);
    if (p.litros) setValue('litros', txt(p.litros), op);
    if (p.precio_unitario) setValue('precioUnitario', txt(p.precio_unitario), op);
    if (p.moneda && monedas?.some((m) => m.codigo === p.moneda)) setValue('moneda', p.moneda, op);
    if (p.odometro_km) setValue('odometroKm', txt(p.odometro_km), op);
  };
  // Después de crear la carga: la foto queda como su ticket (si la IA leyó el número)
  const adjuntarTicket = async (cargaId: number, fechaDia: string) => {
    if (!fotoTicket || lector.estado.fase !== 'listo' || !lector.estado.propuesta.numero_comprobante) return;
    try {
      const { blob, extension, tipo } = await prepararArchivo(fotoTicket);
      const hash = await sha256Hex(blob);
      const ruta = rutaArchivo(cargaId, extension, idAleatorio());
      const subida = await browserDb().storage.from(BUCKET_DOCUMENTOS).upload(ruta, blob, { contentType: tipo, upsert: false });
      if (subida.error) return;
      await adjuntar.mutateAsync({
        cargaId,
        tipo: 'ticket',
        numero: lector.estado.propuesta.numero_comprobante,
        fecha: fechaDia,
        archivo: ruta,
        hash,
        emisorId: emisor.data ?? null,
      });
    } catch {
      // si no se pudo adjuntar, se adjunta después desde la ficha de la carga
    }
  };

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
    if (conIA) {
      await adjuntarTicket(r.data, d.fechaHoraLocal.slice(0, 10));
      await lector.marcarUsada({ litros: d.litros, precio_unitario: d.precioUnitario, estacion_id: Number(d.estacionId) || null, fecha: d.fechaHoraLocal.slice(0, 10) });
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
      {!carga && !reemplazaId && <DestinoCargaSelector actual="tractor" />}

      <ErrorBase error={error} />

      {conIA && (
        <section className={cn(TARJETA, 'space-y-3 p-5')} aria-label="Foto del ticket">
          <div className="flex flex-wrap items-center gap-3">
            <label className={cn(BOTON_SECUNDARIO, 'cursor-pointer')}>
              <Camera className="size-4" /> {fotoTicket ? 'Otra foto del ticket' : 'Foto del ticket: completar con IA'}
              <input
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                className="sr-only"
                disabled={lector.estado.fase === 'leyendo'}
                onChange={(ev) => {
                  const f = ev.target.files?.[0];
                  if (f) void leerTicket(f);
                  ev.target.value = '';
                }}
              />
            </label>
            {fotoTicket && <span className="text-sm text-tinta-suave">{fotoTicket.name}</span>}
          </div>
          <AvisoIA estado={lector.estado} />
          <p className="text-xs text-tinta-suave">
            Opcional. La IA lee el ticket y completa lo que puede; revisá todo antes de guardar. Si lee el número, la foto queda adjunta como ticket.
          </p>
        </section>
      )}

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
        <Campo label="Chofer" error={e.choferId?.message} {...(choferAuto !== null && chofer === choferAuto ? { ayuda: 'Chofer fijo del tractor: se puede cambiar.' } : {})}>
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
        <div className="space-y-1">
          <Campo label="Fecha y hora *" error={e.fechaHoraLocal?.message} ayuda={`La del ticket (hora de ${zonaHoraria}).`}>
            <input type="datetime-local" {...register('fechaHoraLocal')} />
          </Campo>
          {!carga && (
            <button
              type="button"
              className="text-xs text-marca hover:underline"
              onClick={() => setValue('fechaHoraLocal', isoAHoraLocal(new Date().toISOString(), zonaHoraria), { shouldValidate: true })}
            >
              Es ahora
            </button>
          )}
        </div>
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
