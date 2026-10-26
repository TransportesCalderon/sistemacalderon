'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, ClipboardList, Copy, LoaderCircle, Plus, Search, X } from 'lucide-react';
import { Panel, TD, TH, useEnvio } from '@/modules/catalogos/components/comun';
import { Cargando, Encabezado, ErrorBase, ErrorLectura, Vacio } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { diaHora } from '@/modules/pizarra/components/formato';
import { normalizar } from '@/modules/pizarra/domain/pizarra.filtros';
import type { ErrorAccion } from '@/server/actions/result';
import { cn } from '@/shared/lib/cn';
import { formatearFechaDia, horaLocalAIso, hoyEnZona, isoAHoraLocal } from '@/shared/lib/fechas';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, CONTROL_FILTRO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import type { FechaDia } from '@/shared/types/dominio';
import type { AltaEntrada } from '../domain/operacion.schemas';
import {
  ESTADO_INFO,
  GRUPOS_FILTRO,
  HITO_ETIQUETA,
  PASOS_CON_ODOMETRO,
  PASO_OPERACION_ETIQUETA,
  TIPO_OPERACION_ETIQUETA,
  TIPOS_OPERACION,
  esAbierta,
  etiquetaTipo,
  type GrupoFiltro,
  type Operacion,
  type PasoOperacion,
} from '../domain/operacion.types';
import {
  useAltaOperaciones,
  useAnularHito,
  useAsignarEquipo,
  useAsignarTercero,
  useAvanzarOperacion,
  useCancelarOperacion,
  useGuardarOperacion,
  useLineas,
  useOperaciones,
  useOpcionesViaje,
  useQuitarEquipo,
  useSugerenciaCliente,
  useTramosOperacion,
  useTransportistas,
  useViajesEnVivo,
} from '../queries/hooks';
import { Lista } from './viajes-pantalla';
import { SeguimientoOperacion } from '@/modules/chofer/components/seguimiento-operacion';

type Abierto =
  | { tipo: 'nueva'; base?: Operacion }
  | { tipo: 'detalle' | 'modificar' | 'equipo' | 'tercero' | 'cancelar'; o: Operacion }
  | { tipo: 'paso'; o: Operacion; paso: PasoOperacion; error?: ErrorAccion | null }
  | null;

const aIso = (local: string, zona: string) => (local ? (horaLocalAIso(local, zona) ?? local) : '');
const aLocal = (iso: string | null, zona: string) => (iso ? isoAHoraLocal(iso, zona) : '');
const primeroDelMes = (hoy: FechaDia) => `${hoy.slice(0, 8)}01` as FechaDia;

/**
 * Operación > Operaciones (Logística, migraciones 41 y 42). Todo desde una pantalla: alta corta,
 * y en cada fila el botón con el paso que sigue (un clic, ahora). Qué sigue lo decide la base
 * (ops.fn_pasos); acá solo se muestra y sus mensajes se ven tal cual.
 */
export function OperacionesPantalla({ opInicial, nueva = false }: { opInicial?: number; nueva?: boolean }) {
  const { zonaHoraria } = useSesion();
  const puede = useCan('operacion.servicios:editar');
  const vivo = useViajesEnVivo();
  const hoy = hoyEnZona(zonaHoraria);
  const [desde, setDesde] = useState<string>(primeroDelMes(hoy));
  const [hasta, setHasta] = useState<string>(hoy);
  const [texto, setTexto] = useState(opInicial ? String(opInicial) : '');
  const [grupo, setGrupo] = useState<GrupoFiltro>('todos');
  const [abierto, setAbiertoEstado] = useState<Abierto>(nueva && puede ? { tipo: 'nueva' } : null);
  // ?op=<nro>: la ficha de esa operación se abre sola hasta que se toque otra cosa.
  const [auto, setAuto] = useState(!!opInicial);
  const setAbierto = (a: Abierto) => {
    setAuto(false);
    setAbiertoEstado(a);
  };
  const { data, isPending, isError, refetch } = useOperaciones((desde || null) as FechaDia | null, (hasta || null) as FechaDia | null);

  const buscadas = useMemo(() => {
    const t = normalizar(texto);
    return (data ?? []).filter(
      (o) =>
        !t ||
        [String(o.numero), o.redline ? String(o.redline.numero) : null, o.cliente, o.linea, o.contenedor, o.chofer, o.tractor, o.semi, o.booking, o.crt, o.mic, o.transportista].some(
          (c) => normalizar(c).includes(t),
        ),
    );
  }, [data, texto]);
  const cuenta = (g: (typeof GRUPOS_FILTRO)[number]) =>
    g.estados === null ? buscadas.length : buscadas.filter((o) => (g.estados as readonly string[]).includes(o.estadoLogistica)).length;
  const actual = GRUPOS_FILTRO.find((g) => g.id === grupo) ?? GRUPOS_FILTRO[0];
  const filas = actual.estados === null ? buscadas : buscadas.filter((o) => (actual.estados as readonly string[]).includes(o.estadoLogistica));
  const abrirDe = (o: Operacion): Abierto => {
    if (abierto && 'o' in abierto && abierto.o.servicioId === o.servicioId) return { ...abierto, o } as Abierto;
    return auto && opInicial === o.numero ? { tipo: 'detalle', o } : null;
  };

  return (
    <div className="space-y-4">
      <Encabezado titulo="Operaciones" subtitulo="Operación · Logística">
        <span className="flex items-center gap-1.5 text-xs text-tinta-suave">
          <span className={cn('size-2 rounded-full', vivo === 'en_vivo' ? 'bg-exito' : 'bg-[#fdb022]')} />
          {vivo === 'en_vivo' ? 'En vivo' : 'Actualiza cada minuto'}
        </span>
        <Link href="/flota/pizarra" className={BOTON_SECUNDARIO}>
          Pizarra Azul
        </Link>
        {puede && (
          <button type="button" className={BOTON_PRIMARIO} onClick={() => setAbierto({ tipo: 'nueva' })}>
            <Plus className="size-4" /> Nueva operación
          </button>
        )}
      </Encabezado>

      {abierto?.tipo === 'nueva' && <FormOperacion base={abierto.base} duplicar zona={zonaHoraria} onCerrar={() => setAbierto(null)} />}

      <section className="flex flex-wrap items-center gap-2">
        <label className="relative block w-full max-w-xs">
          <span className="sr-only">Buscar</span>
          <Search className="absolute top-2.5 left-2.5 size-4 text-tinta-suave" />
          <input
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Nro., cliente, contenedor, chofer…"
            className={cn(CONTROL_FILTRO, 'w-full pl-8')}
          />
        </label>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por estado">
          {GRUPOS_FILTRO.map((g) => (
            <button
              key={g.id}
              type="button"
              aria-pressed={grupo === g.id}
              onClick={() => setGrupo(g.id)}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold',
                g.clase,
                grupo === g.id ? 'ring-2 ring-tinta ring-offset-1' : 'opacity-80 hover:opacity-100',
              )}
            >
              {g.etiqueta} <span className="tabular-nums">{cuenta(g)}</span>
            </button>
          ))}
        </div>
        <details className="ml-auto text-xs text-tinta-suave">
          <summary className="cursor-pointer select-none">Terminadas entre…</summary>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input type="date" aria-label="Desde" className={CONTROL_FILTRO} value={desde} onChange={(e) => setDesde(e.target.value)} />
            <span>y</span>
            <input type="date" aria-label="Hasta" className={CONTROL_FILTRO} value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
          <p className="mt-1 max-w-xs">Las abiertas se ven siempre; las fechas solo filtran las entregadas y canceladas.</p>
        </details>
      </section>

      <div className={cn(TARJETA, 'overflow-x-auto')}>
        {isPending ? (
          <Cargando texto="Cargando operaciones…" />
        ) : isError ? (
          <ErrorLectura texto="No se pudieron cargar las operaciones." onReintentar={() => refetch()} />
        ) : filas.length === 0 ? (
          <Vacio
            icono={<ClipboardList className="size-5" />}
            texto={(data ?? []).length === 0 ? 'No hay operaciones abiertas ni terminadas en esas fechas.' : 'Ninguna operación coincide con el filtro.'}
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-borde bg-fondo">
              <tr>
                <th className={TH}>Nro. Op.</th>
                <th className={TH}>Cliente</th>
                <th className={TH}>Línea</th>
                <th className={TH}>Presentación</th>
                <th className={TH}>Estado</th>
                <th className={TH}>Chofer · equipo</th>
                <th className={TH}>Contenedor</th>
                {puede && <th className={TH}>Siguiente paso</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {filas.map((o) => (
                <FilaOperacion key={o.servicioId} o={o} zona={zonaHoraria} puede={puede} abierto={abrirDe(o)} onAbrir={setAbierto} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function EstadoChip({ o }: { o: Operacion }) {
  const e = ESTADO_INFO[o.estadoLogistica];
  return (
    <span className={cn('inline-flex h-5 items-center rounded-[3px] px-1.5 text-xs font-semibold whitespace-nowrap', e.clase)}>{e.etiqueta}</span>
  );
}

/**
 * Hace un paso con un clic (ahora). Si la base pide algo más (el odómetro sin telemetría, el motivo de
 * la demora) abre el panel del paso con su mensaje para completarlo.
 */
function useUnClic(o: Operacion, onAbrir: (a: Abierto) => void) {
  const avanzar = useAvanzarOperacion();
  const [enCurso, setEnCurso] = useState<PasoOperacion | null>(null);
  const hacer = async (paso: PasoOperacion) => {
    if (paso === 'equipo') return onAbrir({ tipo: 'equipo', o });
    if (paso === 'demora') return onAbrir({ tipo: 'paso', o, paso });
    setEnCurso(paso);
    const r = await avanzar.mutateAsync({ servicioId: o.servicioId, paso, momento: '', odometroKm: '', detalle: '' });
    setEnCurso(null);
    if (!r.ok) onAbrir({ tipo: 'paso', o, paso, error: r.error });
  };
  return { hacer, enCurso };
}

function BotonPaso({ paso, principal, enCurso, onClick }: { paso: PasoOperacion; principal?: boolean; enCurso: PasoOperacion | null; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={enCurso !== null}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold whitespace-nowrap disabled:opacity-60',
        principal ? 'bg-marca text-white hover:bg-marca/90' : 'border border-borde bg-panel text-tinta hover:bg-hover',
      )}
    >
      {enCurso === paso && <LoaderCircle className="size-3.5 animate-spin" />}
      {PASO_OPERACION_ETIQUETA[paso]}
    </button>
  );
}

function FilaOperacion({
  o,
  zona,
  puede,
  abierto,
  onAbrir,
}: {
  o: Operacion;
  zona: string;
  puede: boolean;
  abierto: Abierto;
  onAbrir: (a: Abierto) => void;
}) {
  const { hacer, enCurso } = useUnClic(o, onAbrir);
  const sinEquipo = !o.tramoId && !o.transportistaId;
  const abiertoAqui = !!abierto;
  return (
    <>
      <tr
        className={cn('cursor-pointer hover:bg-hover/60', abiertoAqui && 'bg-marca-suave/50')}
        onClick={() => onAbrir(abiertoAqui ? null : { tipo: 'detalle', o })}
      >
        <td className={cn(TD, 'whitespace-nowrap')}>
          <span className="inline-flex items-center gap-1 font-mono font-semibold text-marca">
            {abiertoAqui ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            {o.numero}
          </span>
          <span className="block pl-[18px] text-[11px] text-tinta-suave">{etiquetaTipo(o.tipo)}</span>
          {o.redline && <span className="block pl-[18px] text-[11px] text-tinta-suave">Redline {o.redline.numero}</span>}
        </td>
        <td className={cn(TD, 'font-medium text-tinta')}>
          {o.cliente}
          {o.producto && <span className="block text-xs font-normal text-tinta-suave">{o.producto}</span>}
        </td>
        <td className={cn(TD, 'font-mono text-xs whitespace-nowrap')}>
          {o.linea ?? (
            <span className="font-sans">
              {o.origen} → {o.destino}
            </span>
          )}
        </td>
        <td className={cn(TD, 'whitespace-nowrap')}>{diaHora(o.fechaPresentacion, zona)}</td>
        <td className={TD}>
          <EstadoChip o={o} />
        </td>
        <td className={cn(TD, 'text-xs')}>
          {sinEquipo ? (
            <span className="font-medium text-[#b54708]">Sin equipo</span>
          ) : (
            <>
              <span className="font-medium text-tinta">{o.chofer ?? '—'}</span>
              <span className="block font-mono text-tinta-suave">
                {[o.tractor, o.semi].filter(Boolean).join(' · ')}
                {o.transportista && <span className="font-sans"> · {o.transportista}</span>}
              </span>
            </>
          )}
        </td>
        <td className={cn(TD, 'font-mono text-xs')}>
          {o.contenedor ?? '—'}
          {o.tipoContenedor && <span className="block font-sans text-tinta-suave">{o.tipoContenedor}</span>}
          {o.contenedorVacio && <span className="block font-sans text-[#b54708]">Contenedor vacío</span>}
        </td>
        {puede && (
          <td className={cn(TD, 'whitespace-nowrap')}>
            {o.siguiente ? (
              <BotonPaso paso={o.siguiente} principal enCurso={enCurso} onClick={() => void hacer(o.siguiente as PasoOperacion)} />
            ) : (
              <span className="text-xs text-tinta-suave">—</span>
            )}
          </td>
        )}
      </tr>
      {abierto && (
        <tr>
          <td colSpan={puede ? 8 : 7} className="px-3 pb-4">
            <Detalle o={o} zona={zona} puede={puede} abierto={abierto} onAbrir={onAbrir} />
          </td>
        </tr>
      )}
    </>
  );
}

// ------------------------------------------------------------------ ficha

function Dato({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-tinta-suave">{label}</dt>
      <dd className={cn('text-sm text-tinta', mono && 'font-mono')}>{children}</dd>
    </div>
  );
}

function Detalle({ o, zona, puede, abierto, onAbrir }: { o: Operacion; zona: string; puede: boolean; abierto: Abierto; onAbrir: (a: Abierto) => void }) {
  const { hacer, enCurso } = useUnClic(o, onAbrir);
  const anular = useAnularHito();
  const envioAnular = useEnvio();
  const cerrar = () => onAbrir({ tipo: 'detalle', o });
  const tipo = abierto?.tipo;
  const abiertaOp = esAbierta(o);
  const cerrada = ['entregado', 'facturado', 'cancelado'].includes(o.estado);

  // Solo lo que tiene dato: la ficha corta se lee de un vistazo.
  const datos: [string, ReactNode, boolean?][] = (
    [
      ['Retiro', o.lugarRetiro],
      ['Carga', o.origen],
      ['Aduana', o.lugarAduana],
      ['Entrega', o.destino],
      ['Presentación', o.fechaPresentacion && diaHora(o.fechaPresentacion, zona)],
      ['Entrega programada', o.fechaEntrega && diaHora(o.fechaEntrega, zona)],
      ['Salió / cargó', o.inicioReal && diaHora(o.inicioReal, zona)],
      ['Entregó', o.finReal && diaHora(o.finReal, zona)],
      ['Booking · BL', o.booking, true],
      ['Nro. PO', o.referenciaCliente],
      ['Buque', o.buque],
      ['Precinto', o.precinto, true],
      ['Peso bruto', o.pesoKg !== null && `${o.pesoKg.toLocaleString('es-AR')} kg`],
      ['Tara que pide', o.taraMaxDias && `${o.taraMaxDias} días`],
      ['CRT', o.crt, true],
      ['MIC', o.mic, true],
      ['Transportista', o.transportista],
      ['Fecha de la operación', formatearFechaDia(o.fecha)],
    ] as [string, ReactNode, boolean?][]
  ).filter(([, v]) => v !== null && v !== undefined && v !== '' && v !== false);

  const acciones: { id: 'modificar' | 'tercero' | 'cancelar'; etiqueta: string }[] = puede
    ? [
        ...(!cerrada ? [{ id: 'modificar' as const, etiqueta: abiertaOp ? 'Modificar' : 'Completar documentación' }] : []),
        ...(!o.tramoId && ['sin_confirmar', 'planificado', 'en_curso'].includes(o.estado)
          ? [{ id: 'tercero' as const, etiqueta: o.transportistaId ? 'Transportista externo' : 'La hace un externo' }]
          : []),
        ...(abiertaOp ? [{ id: 'cancelar' as const, etiqueta: 'Cancelar' }] : []),
      ]
    : [];

  return (
    <div className="space-y-3 rounded-lg border border-borde bg-fondo/40 p-4" onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-tinta">
            Operación {o.numero} · {etiquetaTipo(o.tipo)} <EstadoChip o={o} />
          </h3>
          <p className="text-sm text-tinta-suave">
            {o.cliente}
            {o.linea && ` · ${o.linea}`}
            {o.motivoCancelacion && ` · Cancelada: ${o.motivoCancelacion}`}
          </p>
          {o.redline && (
            <p className="text-xs text-tinta-suave">
              Traída de Redline: N° {o.redline.numero} · {o.redline.estado}
              {[o.redline.camion && `camión ${o.redline.camion}`, o.redline.semi && `semi ${o.redline.semi}`, o.redline.chofer && `chofer ${o.redline.chofer}`]
                .filter(Boolean)
                .map((t) => ` · ${t}`)
                .join('')}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {acciones.map((a) => (
            <button
              key={a.id}
              type="button"
              className="font-medium text-marca hover:underline"
              onClick={() => onAbrir(tipo === a.id ? { tipo: 'detalle', o } : { tipo: a.id, o })}
            >
              {a.etiqueta}
            </button>
          ))}
          {puede && (
            <button type="button" className="inline-flex items-center gap-1 font-medium text-marca hover:underline" onClick={() => onAbrir({ tipo: 'nueva', base: o })}>
              <Copy className="size-3.5" /> Duplicar
            </button>
          )}
          {o.tramoId && (
            <Link href={`/operacion/viajes?tramo=${o.tramoId}`} className="text-tinta-suave hover:underline">
              Ver el viaje
            </Link>
          )}
        </div>
      </div>

      <TramosDeLaOperacion servicioId={o.servicioId} />

      {puede && o.posibles.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {o.posibles.map((p) => (
            <BotonPaso key={p} paso={p} principal={p === o.siguiente} enCurso={enCurso} onClick={() => void hacer(p)} />
          ))}
          {o.posibles.some((p) => p !== 'equipo') && (
            <button
              type="button"
              className="text-xs text-marca hover:underline"
              onClick={() => onAbrir({ tipo: 'paso', o, paso: o.siguiente && o.siguiente !== 'equipo' ? o.siguiente : (o.posibles.find((p) => p !== 'equipo') as PasoOperacion) })}
            >
              …con otra fecha u hora
            </button>
          )}
          {o.estado === 'planificado' && o.tramoId && (
            <button type="button" className="text-xs text-marca hover:underline" onClick={() => onAbrir({ tipo: 'equipo', o })}>
              Cambiar equipo
            </button>
          )}
        </div>
      )}

      {tipo === 'paso' && abierto?.tipo === 'paso' && <PanelPaso o={o} paso={abierto.paso} errorInicial={abierto.error ?? null} zona={zona} onCerrar={cerrar} />}
      {tipo === 'modificar' && <FormOperacion base={o} zona={zona} onCerrar={cerrar} />}
      {tipo === 'equipo' && <PanelEquipo o={o} onCerrar={cerrar} />}
      {tipo === 'tercero' && <PanelTercero o={o} onCerrar={cerrar} />}
      {tipo === 'cancelar' && <PanelCancelar o={o} onCerrar={cerrar} />}

      {o.hitos.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 text-xs">
          {o.hitos.map((h) => (
            <li key={h.id} className="inline-flex items-center gap-1 rounded-full border border-borde bg-panel px-2 py-0.5">
              <span className="font-medium text-tinta">{HITO_ETIQUETA[h.tipo]}</span>
              <span className="text-tinta-suave">
                {diaHora(h.ts, zona)}
                {h.tipo === 'demora' && (h.hasta ? ` → ${diaHora(h.hasta, zona)}` : ' · sigue')}
                {h.detalle && ` · ${h.detalle}`}
              </span>
              {puede && !cerrada && (
                <button
                  type="button"
                  aria-label={`Anular ${HITO_ETIQUETA[h.tipo]}`}
                  title="Anular (cargado por error)"
                  className="text-tinta-suave hover:text-error"
                  disabled={anular.isPending}
                  onClick={() => void envioAnular.enviar(anular.mutateAsync({ hitoId: h.id }), () => undefined)}
                >
                  <X className="size-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <ErrorBase error={envioAnular.error} />

      <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-6">
        {datos.map(([l, v, mono]) => (
          <Dato key={l} label={l} mono={mono}>
            {v}
          </Dato>
        ))}
      </dl>
      {o.observacion && <p className="text-sm text-tinta">{o.observacion}</p>}
      {!o.transportistaId && o.estado !== 'sin_confirmar' && (
        <SeguimientoOperacion servicioId={o.servicioId} abierta={['planificado', 'en_curso'].includes(o.estado)} />
      )}
    </div>
  );
}

function PanelPaso({
  o,
  paso: pasoInicial,
  errorInicial,
  zona,
  onCerrar,
}: {
  o: Operacion;
  paso: PasoOperacion;
  errorInicial: ErrorAccion | null;
  zona: string;
  onCerrar: () => void;
}) {
  const avanzar = useAvanzarOperacion();
  const { error, setError, enviar, campo } = useEnvio();
  const mostrado = error ?? errorInicial;
  const [f, setF] = useState({ paso: pasoInicial, momento: '', odometroKm: '', detalle: '' });
  const pasos = o.posibles.filter((p) => p !== 'equipo');
  const pideOdometro = !!o.tramoId && PASOS_CON_ODOMETRO.includes(f.paso);
  return (
    <Panel
      titulo={`${PASO_OPERACION_ETIQUETA[f.paso]} · Op. ${o.numero}`}
      explicacion={errorInicial ? undefined : 'Para registrarlo con otra fecha u hora. Vacío = ahora.'}
      error={mostrado}
      ocupado={avanzar.isPending}
      textoBoton="Registrar"
      onCerrar={onCerrar}
      onConfirmar={() => {
        setError(null);
        void enviar(avanzar.mutateAsync({ servicioId: o.servicioId, ...f, momento: aIso(f.momento, zona) }), onCerrar);
      }}
    >
      <Campo label="Paso" error={campo('paso')}>
        <select value={f.paso} onChange={(e) => setF({ ...f, paso: e.target.value as PasoOperacion })}>
          {pasos.map((p) => (
            <option key={p} value={p}>
              {PASO_OPERACION_ETIQUETA[p]}
            </option>
          ))}
        </select>
      </Campo>
      <Campo label="Fecha y hora" error={campo('momento')} ayuda="Vacío = ahora.">
        <input type="datetime-local" value={f.momento} onChange={(e) => setF({ ...f, momento: e.target.value })} />
      </Campo>
      {pideOdometro && (
        <Campo label="Odómetro del tractor (km)" error={campo('odometroKm')} ayuda="Solo si no hay telemetría.">
          <input inputMode="decimal" value={f.odometroKm} onChange={(e) => setF({ ...f, odometroKm: e.target.value })} />
        </Campo>
      )}
      <Campo label={f.paso === 'demora' ? 'Motivo' : 'Nota'} error={campo('detalle')}>
        <input maxLength={500} value={f.detalle} onChange={(e) => setF({ ...f, detalle: e.target.value })} />
      </Campo>
    </Panel>
  );
}

// -------------------------------------------------------------- formulario

const vacioForm = (zona: string) => ({
  sinConfirmar: false,
  cantidad: '1',
  semiId: '',
  camionId: '',
  choferId: '',
  tipoOperacion: '',
  fechaOperacion: hoyEnZona(zona) as string,
  clienteId: '',
  lineaId: '',
  lugarRetiroId: '',
  origenId: '',
  lugarAduanaId: '',
  destinoId: '',
  fechaPresentacion: '',
  fechaEntrega: '',
  producto: '',
  pesoKg: '',
  tipoContenedor: '',
  contenedor: '',
  contenedorVacio: false,
  precinto: '',
  taraMaxDias: '',
  booking: '',
  referenciaCliente: '',
  buque: '',
  crt: '',
  mic: '',
  observacion: '',
});
type Form = ReturnType<typeof vacioForm>;
const MAS_DATOS: (keyof Form)[] = [
  'lugarRetiroId',
  'origenId',
  'lugarAduanaId',
  'destinoId',
  'fechaOperacion',
  'fechaEntrega',
  'booking',
  'referenciaCliente',
  'buque',
  'precinto',
  'pesoKg',
  'taraMaxDias',
  'crt',
  'mic',
  'observacion',
];

/**
 * Alta corta (cliente, tipo, línea, presentación, mercadería, contenedor y, si ya se sabe, el equipo);
 * el resto en «Más datos». Al elegir el cliente se propone lo de su última operación. «Cantidad» crea
 * varias iguales. Sirve también para modificar y duplicar.
 */
function FormOperacion({ base, duplicar, zona, onCerrar }: { base?: Operacion; duplicar?: boolean; zona: string; onCerrar: () => void }) {
  const alta = useAltaOperaciones();
  const guardar = useGuardarOperacion();
  const { data: op } = useOpcionesViaje();
  const { data: lineas } = useLineas();
  const { error, enviar, campo } = useEnvio();
  const editar = !!base && !duplicar;
  // Migración 79: una entregada traída de Redline se puede completar (línea, lugares, cliente)
  const soloDocs = editar && !esAbierta(base) && !(base.redline && base.estado === 'entregado');
  const [f, setF] = useState<Form>(() => {
    const v = vacioForm(zona);
    if (!base) return v;
    const s = (x: string | number | null) => (x === null ? '' : String(x));
    return {
      ...v,
      tipoOperacion: s(base.tipo),
      fechaOperacion: editar ? base.fecha : v.fechaOperacion,
      clienteId: s(base.clienteId),
      lineaId: s(base.lineaId),
      lugarRetiroId: s(base.lugarRetiroId),
      origenId: s(base.origenId),
      lugarAduanaId: s(base.lugarAduanaId),
      destinoId: s(base.destinoId),
      fechaPresentacion: aLocal(base.fechaPresentacion, zona),
      fechaEntrega: aLocal(base.fechaEntrega, zona),
      producto: s(base.producto),
      pesoKg: s(base.pesoKg),
      tipoContenedor: s(base.tipoContenedor),
      contenedorVacio: base.contenedorVacio ?? false,
      contenedor: editar ? s(base.contenedor) : '',
      precinto: editar ? s(base.precinto) : '',
      taraMaxDias: s(base.taraMaxDias),
      booking: s(base.booking),
      referenciaCliente: s(base.referenciaCliente),
      buque: s(base.buque),
      crt: editar ? s(base.crt) : '',
      mic: editar ? s(base.mic) : '',
      observacion: s(base.observacion),
    };
  });
  const [mas, setMas] = useState(editar);
  const set = (k: keyof Form) => (val: string) => setF((p) => ({ ...p, [k]: val }));
  const ev = (k: keyof Form) => (e: { target: { value: string } }) => set(k)(e.target.value);

  /** Elegir la línea completa los lugares (la base hace lo mismo con los que queden vacíos). */
  const conLinea = (p: Form, id: string): Form => {
    const l = lineas?.find((x) => String(x.id) === id);
    return l
      ? {
          ...p,
          lineaId: id,
          lugarRetiroId: String(l.lugarRetiroId),
          origenId: String(l.lugarRetiroId),
          lugarAduanaId: l.lugarAduanaId ? String(l.lugarAduanaId) : '',
          destinoId: String(l.lugarEntregaId),
        }
      : { ...p, lineaId: id };
  };

  // Sugerencia del cliente: solo en el alta nueva y solo en los campos vacíos.
  const nueva = !base;
  const clienteNum = nueva && f.clienteId ? Number(f.clienteId) : null;
  const { data: sug } = useSugerenciaCliente(clienteNum);
  const aplicada = useRef<number | null>(null);
  const [sugerido, setSugerido] = useState(false);
  useEffect(() => {
    if (!sug || !clienteNum || aplicada.current === clienteNum) return;
    aplicada.current = clienteNum;
    setF((p) => {
      let n = { ...p };
      if (!n.tipoOperacion && sug.tipoOperacion) n.tipoOperacion = sug.tipoOperacion;
      if (!n.lineaId && sug.lineaId) n = conLinea(n, String(sug.lineaId));
      else if (!n.lineaId) {
        if (!n.lugarRetiroId && sug.lugarRetiroId) n.lugarRetiroId = String(sug.lugarRetiroId);
        if (!n.origenId && sug.origenId) n.origenId = String(sug.origenId);
        if (!n.lugarAduanaId && sug.lugarAduanaId) n.lugarAduanaId = String(sug.lugarAduanaId);
        if (!n.destinoId && sug.destinoId) n.destinoId = String(sug.destinoId);
      }
      if (!n.producto && sug.producto) n.producto = sug.producto;
      if (!n.tipoContenedor && sug.tipoContenedor) n.tipoContenedor = sug.tipoContenedor;
      if (!n.taraMaxDias && sug.taraMaxDias) n.taraMaxDias = String(sug.taraMaxDias);
      return n;
    });
    setSugerido(true);
    // conLinea depende de las líneas ya cargadas; se aplica una vez por cliente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sug, clienteNum]);

  // Un error en un campo de «Más datos» lo abre, para que se vea.
  useEffect(() => {
    if (MAS_DATOS.some((k) => campo(k))) setMas(true);
  }, [error]); // eslint-disable-line react-hooks/exhaustive-deps

  const opLineas = lineas?.filter((l) => l.activa || String(l.id) === f.lineaId).map((l) => ({ id: l.id, nombre: l.codigo }));
  const varias = !editar && Number(f.cantidad) > 1;
  const conEquipo = !editar && !varias && !f.sinConfirmar;
  const ocupado = alta.isPending || guardar.isPending;
  const bloq = soloDocs;

  const enviarForm = () => {
    const comun = {
      ...f,
      tipoOperacion: f.tipoOperacion as AltaEntrada['tipoOperacion'],
      fechaPresentacion: aIso(f.fechaPresentacion, zona),
      fechaEntrega: aIso(f.fechaEntrega, zona),
    };
    return editar
      ? enviar(guardar.mutateAsync({ ...comun, servicioId: base.servicioId, versionFila: base.versionFila }), onCerrar)
      : enviar(
          alta.mutateAsync({
            ...comun,
            servicioId: null,
            versionFila: null,
            semiId: conEquipo ? f.semiId : '',
            camionId: conEquipo ? f.camionId : '',
            choferId: conEquipo ? f.choferId : '',
          }),
          onCerrar,
        );
  };

  return (
    <form
      noValidate
      className="space-y-3 rounded-lg border border-borde bg-panel p-4 shadow-sm"
      onClick={(e) => e.stopPropagation()}
      onSubmit={(e) => {
        e.preventDefault();
        void enviarForm();
      }}
    >
      <div>
        <h3 className="font-medium text-tinta">
          {editar ? (soloDocs ? `Documentación de la operación ${base.numero}` : `Modificar la operación ${base.numero}`) : base ? `Duplicar la operación ${base.numero}` : 'Nueva operación'}
        </h3>
        {soloDocs && <p className="text-sm text-tinta-suave">Ya salió: se completan la documentación, la mercadería y la entrega programada.</p>}
        {sugerido && <p className="text-sm text-tinta-suave">Se completó con lo de la última operación del cliente; cambiá lo que haga falta.</p>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Campo label="Cliente *" error={campo('clienteId')}>
          <Lista valor={f.clienteId} opciones={op?.clientes} onCambiar={set('clienteId')} disabled={bloq} />
        </Campo>
        <Campo label="Tipo *" error={campo('tipoOperacion')}>
          <select value={f.tipoOperacion} onChange={ev('tipoOperacion')} disabled={bloq}>
            <option value="">Elegí…</option>
            {TIPOS_OPERACION.map((t) => (
              <option key={t} value={t}>
                {TIPO_OPERACION_ETIQUETA[t]}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Línea" error={campo('lineaId')} ayuda="Completa retiro, aduana y entrega.">
          <Lista valor={f.lineaId} opciones={opLineas} onCambiar={(id) => setF((p) => conLinea(p, id))} vacio="Sin línea" disabled={bloq} />
        </Campo>
        <Campo label="Presentación" error={campo('fechaPresentacion')} ayuda="Cuándo se presenta a cargar.">
          <input type="datetime-local" value={f.fechaPresentacion} onChange={ev('fechaPresentacion')} disabled={bloq} />
        </Campo>
        <Campo label="Mercadería" error={campo('producto')}>
          <input maxLength={200} value={f.producto} onChange={ev('producto')} placeholder="Banana, vino, madera…" />
        </Campo>
        <Campo label="Contenedor" error={campo('tipoContenedor')}>
          <input className="uppercase" maxLength={30} value={f.tipoContenedor} onChange={ev('tipoContenedor')} list="tipos-contenedor" placeholder="40 REEFER…" />
        </Campo>
        <label className="flex items-center gap-2 self-center text-sm text-tinta">
          <input type="checkbox" checked={f.contenedorVacio} onChange={(e) => setF((p) => ({ ...p, contenedorVacio: e.target.checked }))} />
          Va con el contenedor vacío (sin mercadería)
        </label>
        {!editar ? (
          <>
            <Campo label="Cantidad" error={campo('cantidad')} ayuda="Crea esa cantidad de operaciones iguales (una por contenedor).">
              <input inputMode="numeric" value={f.cantidad} onChange={ev('cantidad')} />
            </Campo>
            {!varias && (
              <Campo label="Nº de contenedor" error={campo('contenedor')} ayuda="4 letras y 7 números.">
                <input className="uppercase" maxLength={20} value={f.contenedor} onChange={ev('contenedor')} />
              </Campo>
            )}
            <label className="flex items-center gap-2 self-center text-sm text-tinta">
              <input type="checkbox" checked={f.sinConfirmar} onChange={(e) => setF((p) => ({ ...p, sinConfirmar: e.target.checked }))} />
              Sin confirmar (el cliente todavía no la confirmó)
            </label>
          </>
        ) : (
          <Campo label="Nº de contenedor" error={campo('contenedor')} ayuda="4 letras y 7 números.">
            <input className="uppercase" maxLength={20} value={f.contenedor} onChange={ev('contenedor')} />
          </Campo>
        )}
        {conEquipo && (
          <>
            <Campo label="Semi" error={campo('semiId')} ayuda="Opcional: si ya se sabe quién va.">
              <Lista valor={f.semiId} opciones={op?.semis} onCambiar={set('semiId')} vacio="Después" />
            </Campo>
            <Campo label="Tractor" error={campo('camionId')}>
              <Lista valor={f.camionId} opciones={op?.tractores} onCambiar={set('camionId')} vacio="Después" />
            </Campo>
            <Campo label="Chofer" error={campo('choferId')}>
              <Lista valor={f.choferId} opciones={op?.choferes} onCambiar={set('choferId')} vacio="Después" />
            </Campo>
          </>
        )}
        <datalist id="tipos-contenedor">
          {['20 DRY', '40 DRY', '40 HC', '20 REEFER', '40 REEFER', '40 HC REEFER'].map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </div>

      <details open={mas} onToggle={(e) => setMas((e.target as HTMLDetailsElement).open)} className="rounded-md border border-borde">
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-tinta select-none">
          Más datos <span className="font-normal text-tinta-suave">— lugares, Booking, buque, precinto, peso, CRT, MIC, observaciones</span>
        </summary>
        <div className="grid gap-3 border-t border-borde p-3 sm:grid-cols-2 lg:grid-cols-4">
          <Campo label="Lugar retiro" error={campo('lugarRetiroId')}>
            <Lista valor={f.lugarRetiroId} opciones={op?.lugares} onCambiar={set('lugarRetiroId')} vacio="—" disabled={bloq} />
          </Campo>
          <Campo label="Lugar carga" error={campo('origenId')} ayuda="Vacío = el de retiro.">
            <Lista valor={f.origenId} opciones={op?.lugares} onCambiar={set('origenId')} vacio="—" disabled={bloq} />
          </Campo>
          <Campo label="Lugar aduana" error={campo('lugarAduanaId')}>
            <Lista valor={f.lugarAduanaId} opciones={op?.lugares} onCambiar={set('lugarAduanaId')} vacio="—" disabled={bloq} />
          </Campo>
          <Campo label="Lugar entrega" error={campo('destinoId')}>
            <Lista valor={f.destinoId} opciones={op?.lugares} onCambiar={set('destinoId')} vacio="—" disabled={bloq} />
          </Campo>
          <Campo label="Fecha de la operación" error={campo('fechaOperacion')}>
            <input type="date" value={f.fechaOperacion} onChange={ev('fechaOperacion')} disabled={bloq} />
          </Campo>
          <Campo label="Entrega programada" error={campo('fechaEntrega')}>
            <input type="datetime-local" value={f.fechaEntrega} onChange={ev('fechaEntrega')} />
          </Campo>
          <Campo label="Booking · BL" error={campo('booking')}>
            <input className="uppercase" maxLength={60} value={f.booking} onChange={ev('booking')} />
          </Campo>
          <Campo label="Nro. PO · JO" error={campo('referenciaCliente')}>
            <input maxLength={60} value={f.referenciaCliente} onChange={ev('referenciaCliente')} />
          </Campo>
          <Campo label="Buque" error={campo('buque')}>
            <input className="uppercase" maxLength={100} value={f.buque} onChange={ev('buque')} />
          </Campo>
          <Campo label="Precinto" error={campo('precinto')}>
            <input className="uppercase" maxLength={60} value={f.precinto} onChange={ev('precinto')} />
          </Campo>
          <Campo label="Peso bruto (kg)" error={campo('pesoKg')}>
            <input inputMode="decimal" value={f.pesoKg} onChange={ev('pesoKg')} />
          </Campo>
          <Campo label="Tara que pide (días)" error={campo('taraMaxDias')} ayuda="Vacío si no pide.">
            <input inputMode="numeric" value={f.taraMaxDias} onChange={ev('taraMaxDias')} disabled={bloq} />
          </Campo>
          <Campo label="CRT" error={campo('crt')}>
            <input className="uppercase" maxLength={60} value={f.crt} onChange={ev('crt')} />
          </Campo>
          <Campo label="MIC" error={campo('mic')}>
            <input className="uppercase" maxLength={60} value={f.mic} onChange={ev('mic')} />
          </Campo>
          <div className="sm:col-span-2">
            <Campo label="Observaciones" error={campo('observacion')}>
              <input maxLength={2000} value={f.observacion} onChange={ev('observacion')} />
            </Campo>
          </div>
        </div>
      </details>

      <ErrorBase error={error} />
      <div className="flex flex-wrap gap-3">
        <button type="submit" className={BOTON_PRIMARIO} disabled={ocupado}>
          {ocupado && <LoaderCircle className="size-4 animate-spin" />}{' '}
          {editar ? 'Guardar cambios' : varias ? `Crear ${f.cantidad} operaciones` : 'Crear operación'}
        </button>
        <button type="button" className={BOTON_SECUNDARIO} onClick={onCerrar} disabled={ocupado}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------------ paneles

function PanelEquipo({ o, onCerrar }: { o: Operacion; onCerrar: () => void }) {
  const asignar = useAsignarEquipo();
  const quitar = useQuitarEquipo();
  const { data: op } = useOpcionesViaje();
  const { error, enviar, campo } = useEnvio();
  const [f, setF] = useState({
    semiId: o.semiId ? String(o.semiId) : '',
    camionId: o.camionId ? String(o.camionId) : '',
    choferId: o.choferId ? String(o.choferId) : '',
    observacion: '',
  });
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  return (
    <Panel
      titulo={o.tramoId ? `Cambiar equipo · Op. ${o.numero}` : `Asignar equipo · Op. ${o.numero}`}
      explicacion="En la Pizarra el semi pasa a «Asignado»."
      error={error}
      ocupado={asignar.isPending || quitar.isPending}
      textoBoton={o.tramoId ? 'Guardar' : 'Asignar'}
      onCerrar={onCerrar}
      onConfirmar={() => enviar(asignar.mutateAsync({ servicioId: o.servicioId, ...f }), onCerrar)}
    >
      <Campo label="Semi *" error={campo('semiId')}>
        <Lista valor={f.semiId} opciones={op?.semis} onCambiar={set('semiId')} />
      </Campo>
      <Campo label="Tractor *" error={campo('camionId')}>
        <Lista valor={f.camionId} opciones={op?.tractores} onCambiar={set('camionId')} />
      </Campo>
      <Campo label="Chofer *" error={campo('choferId')}>
        <Lista valor={f.choferId} opciones={op?.choferes} onCambiar={set('choferId')} />
      </Campo>
      {o.tramoId && (
        <div className="self-end pb-1">
          <button
            type="button"
            className="text-sm text-marca hover:underline"
            disabled={quitar.isPending}
            onClick={() => void enviar(quitar.mutateAsync({ servicioId: o.servicioId, motivo: '' }), onCerrar)}
          >
            Quitar equipo
          </button>
        </div>
      )}
    </Panel>
  );
}

function PanelTercero({ o, onCerrar }: { o: Operacion; onCerrar: () => void }) {
  const asignar = useAsignarTercero();
  const { data: transportistas } = useTransportistas();
  const { error, enviar, campo } = useEnvio();
  const [f, setF] = useState({
    transportistaId: o.transportistaId ? String(o.transportistaId) : '',
    chofer: o.terceroChofer ?? '',
    tractor: o.terceroTractor ?? '',
    semi: o.terceroSemi ?? '',
  });
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const opciones = transportistas
    ?.filter((t) => t.activo || String(t.id) === f.transportistaId)
    .map((t) => ({ id: t.id, nombre: t.razonSocial }));
  return (
    <Panel
      titulo={`Transportista externo · Op. ${o.numero}`}
      explicacion={
        <>
          Para cuando la hace un fletero (no aparece en la Pizarra). Sin transportista, vuelve a ser de Calderón. Se cargan en{' '}
          <Link href="/operacion/transportistas" className="text-marca hover:underline">
            Transportistas
          </Link>
          .
        </>
      }
      error={error}
      ocupado={asignar.isPending}
      textoBoton="Guardar"
      onCerrar={onCerrar}
      onConfirmar={() => enviar(asignar.mutateAsync({ servicioId: o.servicioId, ...f }), onCerrar)}
    >
      <Campo label="Transportista" error={campo('transportistaId')}>
        <Lista valor={f.transportistaId} opciones={opciones} onCambiar={set('transportistaId')} vacio="Ninguno (Calderón)" />
      </Campo>
      <Campo label="Chofer" error={campo('chofer')}>
        <input className="uppercase" maxLength={120} value={f.chofer} onChange={(e) => set('chofer')(e.target.value)} disabled={!f.transportistaId} />
      </Campo>
      <Campo label="Patente camión" error={campo('tractor')}>
        <input className="uppercase" maxLength={20} value={f.tractor} onChange={(e) => set('tractor')(e.target.value)} disabled={!f.transportistaId} />
      </Campo>
      <Campo label="Patente remolque" error={campo('semi')}>
        <input className="uppercase" maxLength={20} value={f.semi} onChange={(e) => set('semi')(e.target.value)} disabled={!f.transportistaId} />
      </Campo>
    </Panel>
  );
}

function PanelCancelar({ o, onCerrar }: { o: Operacion; onCerrar: () => void }) {
  const cancelar = useCancelarOperacion();
  const { error, enviar, campo } = useEnvio();
  const [motivo, setMotivo] = useState('');
  return (
    <Panel
      titulo={`Cancelar la operación ${o.numero}`}
      explicacion="Solo si todavía no salió. Si tenía equipo, el semi queda libre."
      error={error}
      ocupado={cancelar.isPending}
      textoBoton="Cancelar operación"
      onCerrar={onCerrar}
      onConfirmar={() => enviar(cancelar.mutateAsync({ servicioId: o.servicioId, motivo }), onCerrar)}
    >
      <Campo label="Motivo *" error={campo('motivo')}>
        <input maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </Campo>
    </Panel>
  );
}

/** Migración 81: qué tramo de la operación hizo cada chofer, en qué viaje. */
function TramosDeLaOperacion({ servicioId }: { servicioId: number }) {
  const { data } = useTramosOperacion(servicioId);
  if (!data || data.tramos.length === 0) return null;
  const km = data.tramos.reduce((t, x) => t + (x.km ?? 0), 0);
  return (
    <div className="text-sm">
      <p className="text-xs font-medium text-tinta-suave uppercase">Viajes de chofer</p>
      <ul className="mt-1 space-y-0.5">
        {data.tramos.map((t) => (
          <li key={`${t.viajeId}-${t.linea}`}>
            <Link href={`/operacion/viajes-chofer/${t.viajeId}`} className="font-mono text-marca hover:underline">
              {t.viaje}
            </Link>{' '}
            · {t.linea ?? 'sin tramo'}
            {t.km !== null && ` · ${t.km.toLocaleString('es-AR')} km`}
            {t.chofer && ` · ${t.chofer}`}
            {t.camion && <span className="font-mono text-tinta-suave"> · {t.camion}</span>}
          </li>
        ))}
      </ul>
      {data.tramos.length > 1 && (
        <p className="mt-1 text-xs text-tinta-suave">
          {data.tramos.length} tramos · {km.toLocaleString('es-AR')} km
          {data.kmOperacion !== null && ` (la operación ${data.lineaOperacion ?? ''} tiene ${data.kmOperacion.toLocaleString('es-AR')} km)`}
        </p>
      )}
    </div>
  );
}
