'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm, type Path } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Camera, Gauge, LoaderCircle, Plus } from 'lucide-react';
import { AvisoIA } from '@/modules/ia/aviso-ia';
import { useLitrosSugeridos } from '@/modules/telemetria/queries/hooks';
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
import { evaluarPrecio } from '../../domain/precio-referencia';
import { cargaFormSchema, type CargaFormEntrada } from '../../domain/carga.schemas';
import { ETIQUETA_MEDIO_PAGO, MEDIOS_PAGO, VERSION_FALTANTE_MOCHILA, type Carga, type MedioPago } from '../../domain/carga.types';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import {
  useAdjuntarDocumento,
  useCamionesCombustible,
  useChoferDeTractor,
  useChoferesCombustible,
  useCrearCarga,
  useEditarCarga,
  useEmisorTicket,
  useEstaciones,
  useFaltanteMochila,
  useMonedas,
  useOdometroTelemetria,
  useReferenciaPrecio,
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
/** 04/11/2026: un ticket leído en el alta (la foto y lo que leyó la IA). */
interface TicketLeido {
  archivo: File;
  numero: string | null;
  litros: number | null;
  precio: number | null;
}

export function CargaForm({ camionInicial, reemplazaId, carga }: { camionInicial: number | null; reemplazaId: number | null; carga?: Carga }) {
  const router = useRouter();
  const { zonaHoraria, monedaBase } = useSesion();
  const crear = useCrearCarga();
  const editar = useEditarCarga();
  // Hasta que la página terminó de cargar no se puede enviar (si no, el navegador recarga en blanco sin guardar).
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
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
          faltanteMochilaL: '',
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
          faltanteMochilaL: '',
        },
    mode: 'onTouched',
  });
  const { register, handleSubmit, watch, setValue, formState } = form;
  const e = formState.errors;
  // Migración 268: la parte del faltante que es de la mochila (al editar se trae la guardada)
  const hayMochila = useBaseTiene(VERSION_FALTANTE_MOCHILA);
  const mochilaGuardada = useFaltanteMochila((carga?.id ?? 0) as Carga['id'], hayMochila && !!carga && carga.faltanteLlenoL > 0);
  useEffect(() => {
    if (mochilaGuardada.data != null && !formState.dirtyFields.faltanteMochilaL) setValue('faltanteMochilaL', String(mochilaGuardada.data).replace('.', ','));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mochilaGuardada.data]);
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
  // Migración 89: lo que consumió desde el último llenado de corte (lo calcula la base)
  const sugerido = useLitrosSugeridos(carga ? null : camionId, fechaIso);
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

  // Migración 258: la carga va en la moneda del país de la estación y el precio se compara con lo que
  // se viene pagando ahí. La base es la que bloquea; acá se avisa antes de guardar.
  const estacionId = Number(watch('estacionId')) || null;
  const referencia = useReferenciaPrecio(estacionId, fechaIso).data ?? null;
  const monedaElegida = watch('moneda');
  const monedaDelPais = referencia && monedas?.some((m) => m.codigo === referencia.moneda) ? referencia.moneda : null;
  const surtidorPropio = estaciones?.find((s) => s.id === estacionId)?.esTanquePropio ?? false;
  useEffect(() => {
    // En el alta se pone sola al elegir la estación; en la edición no se pisa (se avisa abajo del campo)
    if (carga) return;
    const moneda = monedaDelPais ?? (surtidorPropio ? (monedaBase ?? null) : null);
    if (moneda && watch('moneda') !== moneda) setValue('moneda', moneda, { shouldValidate: true, shouldDirty: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando cambia la estación o llega su moneda
  }, [estacionId, monedaDelPais, surtidorPropio]);
  const monedaMal =
    monedaDelPais && monedaElegida && monedaElegida !== monedaDelPais
      ? `La estación está en ${referencia?.pais}: la carga va en ${monedaDelPais}, no en ${monedaElegida}.`
      : undefined;
  const precioEvaluado = referencia && !monedaMal ? evaluarPrecio(referencia, precioN, litrosN) : null;
  const precioHabitual = referencia?.precio != null ? `${formatearNumero(referencia.precio)} ${referencia.moneda}` : null;
  const precioImposible =
    precioEvaluado?.nivel === 'imposible'
      ? `No puede ser: en ${referencia?.pais} se viene pagando ≈ ${precioHabitual} por litro. ${
          precioEvaluado.porLitro !== null
            ? `Parece el total del ticket: por litro serían ${formatearNumero(precioEvaluado.porLitro)}.`
            : 'Va el precio de un litro, no el total.'
        }`
      : undefined;
  const precioDudoso =
    precioEvaluado?.nivel === 'dudoso'
      ? `${formatearNumero(Math.abs(precioEvaluado.desvioPct), 0)} % ${precioEvaluado.desvioPct > 0 ? 'por encima' : 'por debajo'} de lo habitual (≈ ${precioHabitual}). Revisá el ticket: si está bien se guarda, y queda una alerta para revisar.`
      : null;

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
  // 04/11/2026: una carga puede tener varios tickets (cuando la bomba llega al límite y se hacen dos)
  const [tickets, setTickets] = useState<TicketLeido[]>([]);
  const emisor = useEmisorTicket(Number(watch('estacionId')) || null);
  const conIA = !carga && lector.disponible;
  const leerTicket = async (archivo: File, sumar = false) => {
    const r = await lector.leer(archivo);
    const p = r?.propuesta;
    const nuevo: TicketLeido = { archivo, numero: p?.numero_comprobante ?? null, litros: p?.litros ?? null, precio: p?.precio_unitario ?? null };
    const lista = sumar ? [...tickets, nuevo] : [nuevo];
    setTickets(lista);
    if (!p) return;
    const op = { shouldValidate: true, shouldDirty: true } as const;
    if (sumar) {
      // Otro ticket de la misma carga: se suman los litros y el precio queda promediado por litro
      const total = lista.reduce((a, t) => a + (t.litros ?? 0), 0);
      const importe = lista.reduce((a, t) => a + (t.litros ?? 0) * (t.precio ?? 0), 0);
      if (total > 0) setValue('litros', txt(Math.round(total * 100) / 100), op);
      if (total > 0 && lista.every((t) => t.precio)) setValue('precioUnitario', txt(Math.round((importe / total) * 10000) / 10000), op);
      return;
    }
    if (p.camion_id && !watch('camionId')) setValue('camionId', String(p.camion_id), op);
    if (p.estacion_id) setValue('estacionId', String(p.estacion_id), op);
    if (p.fecha) setValue('fechaHoraLocal', `${p.fecha}T${p.hora ?? '12:00'}`, op);
    if (p.litros) setValue('litros', txt(p.litros), op);
    if (p.precio_unitario) setValue('precioUnitario', txt(p.precio_unitario), op);
    if (p.moneda && monedas?.some((m) => m.codigo === p.moneda)) setValue('moneda', p.moneda, op);
    if (p.odometro_km) setValue('odometroKm', txt(p.odometro_km), op);
  };
  // Después de crear la carga: cada foto queda como su ticket (las que la IA les leyó el número)
  const adjuntarTickets = async (cargaId: number, fechaDia: string) => {
    for (const t of tickets) await adjuntarTicket(cargaId, fechaDia, t);
  };
  const adjuntarTicket = async (cargaId: number, fechaDia: string, t: TicketLeido) => {
    if (!t.numero) return;
    try {
      const { blob, extension, tipo } = await prepararArchivo(t.archivo);
      const hash = await sha256Hex(blob);
      const ruta = rutaArchivo(cargaId, extension, idAleatorio());
      const subida = await browserDb().storage.from(BUCKET_DOCUMENTOS).upload(ruta, blob, { contentType: tipo, upsert: false });
      if (subida.error) return;
      await adjuntar.mutateAsync({
        cargaId,
        tipo: 'ticket',
        numero: t.numero,
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
        // Solo se manda si la tocaron: si no, la base deja la que estaba (o la propone si cambió el faltante)
        ...(hayMochila && formState.dirtyFields.faltanteMochilaL ? { faltanteMochilaL: d.esFrontera ? d.faltanteMochilaL : null } : {}),
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
      ...(hayMochila && d.esFrontera && d.faltanteMochilaL !== null ? { faltanteMochilaL: d.faltanteMochilaL } : {}),
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
      await adjuntarTickets(r.data, d.fechaHoraLocal.slice(0, 10));
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
              <Camera className="size-4" /> {tickets.length > 0 ? 'Cambiar la foto del ticket' : 'Foto del ticket: completar con IA'}
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
            {tickets.length > 0 && (
              <label className={cn(BOTON_SECUNDARIO, 'cursor-pointer')}>
                <Plus className="size-4" /> Sumar otro ticket (misma carga)
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  capture="environment"
                  className="sr-only"
                  disabled={lector.estado.fase === 'leyendo' || tickets.length >= 5}
                  onChange={(ev) => {
                    const f = ev.target.files?.[0];
                    if (f) void leerTicket(f, true);
                    ev.target.value = '';
                  }}
                />
              </label>
            )}
          </div>
          {tickets.length > 0 && (
            <ul className="space-y-0.5 text-sm text-tinta-suave">
              {tickets.map((t, i) => (
                <li key={i}>
                  Ticket {i + 1}: {t.numero ? `N° ${t.numero}` : 'sin número leído (adjuntalo después desde la ficha)'}
                  {t.litros ? ` · ${txt(t.litros)} L` : ''} · {t.archivo.name}
                </li>
              ))}
            </ul>
          )}
          <AvisoIA estado={lector.estado} />
          <p className="text-xs text-tinta-suave">
            Opcional. La IA lee el ticket y completa lo que puede; revisá todo antes de guardar. Si lee el número, la foto queda adjunta como ticket.
            Si la carga se hizo en dos tickets (la bomba llegó al límite), sumá el otro: los litros se suman.
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
        <Campo
          label="Litros *"
          error={e.litros?.message}
          {...(sugerido.data?.litros != null
            ? { ayuda: `Para llenar faltaban ≈ ${formatearNumero(sugerido.data.litros, 0)} L${sugerido.data.texto ? ` (${sugerido.data.texto})` : ''}.` }
            : {})}
        >
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
        <div className="space-y-1">
          <Campo
            label="Precio unitario *"
            error={e.precioUnitario?.message ?? precioImposible}
            {...(precioHabitual ? { ayuda: `Por litro. En ${referencia?.pais} se viene pagando ≈ ${precioHabitual}.` } : {})}
          >
            <input inputMode="decimal" {...register('precioUnitario')} />
          </Campo>
          {precioDudoso && !e.precioUnitario && <p className="text-xs text-alerta">{precioDudoso}</p>}
        </div>
        <Campo
          label="Moneda *"
          error={e.moneda?.message ?? monedaMal}
          ayuda={
            monedaDelPais
              ? `La del país de la estación (${monedaDelPais}). La cotización de ese día tiene que estar cargada (Finanzas > Tipos de cambio).`
              : 'En otra moneda, la cotización de ese día tiene que estar cargada (Finanzas > Tipos de cambio).'
          }
        >
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
            {hayMochila && (
              <Campo
                label="De esos, en la mochila (L)"
                error={e.faltanteMochilaL?.message}
                ayuda="Vacío: todo en la mochila, hasta su capacidad. Poné 0 si faltó en los tanques."
              >
                <input inputMode="decimal" placeholder="Lo propone el sistema" {...register('faltanteMochilaL')} />
              </Campo>
            )}
            <label className="block space-y-1.5">
              <span className="block text-sm font-medium text-tinta">Observación (si le faltaron litros)</span>
              <textarea rows={2} className={CLASE_TEXTAREA} placeholder="Qué tanque quedó sin llenar y por qué" {...register('faltanteObservacion')} />
              {e.faltanteObservacion?.message && <span className="block text-xs text-error">{e.faltanteObservacion.message}</span>}
            </label>
          </div>
        )}
      </section>

      <div className="flex flex-wrap gap-3">
        <button type="submit" className={BOTON_PRIMARIO} disabled={!montado || crear.isPending || editar.isPending}>
          {(crear.isPending || editar.isPending) && <LoaderCircle className="size-4 animate-spin" />} {carga ? 'Guardar cambios' : 'Registrar carga'}
        </button>
        <Link href={carga ? `/combustible/cargas/${carga.id}` : '/combustible/cargas'} className={BOTON_SECUNDARIO}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
