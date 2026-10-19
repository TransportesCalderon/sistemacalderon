'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ClipboardList, Copy, LoaderCircle, Plus, Search } from 'lucide-react';
import { Panel, TD, TH, useEnvio } from '@/modules/catalogos/components/comun';
import { Cargando, Encabezado, ErrorBase, ErrorLectura, Vacio } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { diaHora } from '@/modules/pizarra/components/formato';
import { normalizar } from '@/modules/pizarra/domain/pizarra.filtros';
import { cn } from '@/shared/lib/cn';
import { formatearFechaDia, horaLocalAIso, hoyEnZona, isoAHoraLocal } from '@/shared/lib/fechas';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, CONTROL_FILTRO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import type { FechaDia } from '@/shared/types/dominio';
import type { OperacionEntrada } from '../domain/operacion.schemas';
import {
  ESTADO_INFO,
  GRUPOS_FILTRO,
  HITO_ETIQUETA,
  TIPO_OPERACION_ETIQUETA,
  TIPOS_HITO,
  TIPOS_OPERACION,
  esAbierta,
  etiquetaTipo,
  type GrupoFiltro,
  type Operacion,
  type TipoHito,
} from '../domain/operacion.types';
import { PASO_INFO, esPaso } from '../domain/viaje.types';
import {
  useAnularHito,
  useAsignarEquipo,
  useAsignarTercero,
  useCancelarOperacion,
  useConfirmarOperacion,
  useGuardarOperacion,
  useLineas,
  useOperaciones,
  useOpcionesViaje,
  useQuitarEquipo,
  useRegistrarHito,
  useTerminarDemora,
  useTransportistas,
  useViajesEnVivo,
} from '../queries/hooks';
import { Lista } from './viajes-pantalla';

type Abierto =
  | { tipo: 'nueva'; base?: Operacion }
  | { tipo: 'detalle' | 'modificar' | 'equipo' | 'tercero' | 'hito' | 'cancelar'; o: Operacion }
  | null;

const aIso = (local: string, zona: string) => (local ? (horaLocalAIso(local, zona) ?? local) : '');
const aLocal = (iso: string | null, zona: string) => (iso ? isoAHoraLocal(iso, zona) : '');
const primeroDelMes = (hoy: FechaDia) => `${hoy.slice(0, 8)}01` as FechaDia;

/**
 * Operación > Operaciones (Logística, migración 41): el listado y la ficha que usaban en REDLINE,
 * con las mismas columnas, los mismos estados y los botones de color. El estado lo calcula la base;
 * acá solo se muestra. Los pasos del viaje propio siguen en Operación > Viajes.
 */
export function OperacionesPantalla({ opInicial }: { opInicial?: number }) {
  const { zonaHoraria } = useSesion();
  const puede = useCan('operacion.servicios:editar');
  const vivo = useViajesEnVivo();
  const hoy = hoyEnZona(zonaHoraria);
  const [desde, setDesde] = useState<string>(primeroDelMes(hoy));
  const [hasta, setHasta] = useState<string>(hoy);
  const [texto, setTexto] = useState(opInicial ? String(opInicial) : '');
  const [grupo, setGrupo] = useState<GrupoFiltro>('todos');
  const [abierto, setAbiertoEstado] = useState<Abierto>(null);
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
        [String(o.numero), o.cliente, o.linea, o.contenedor, o.chofer, o.tractor, o.semi, o.booking, o.crt, o.mic, o.transportista].some(
          (c) => normalizar(c).includes(t),
        ),
    );
  }, [data, texto]);
  const cuenta = (g: (typeof GRUPOS_FILTRO)[number]) =>
    g.estados === null ? buscadas.length : buscadas.filter((o) => (g.estados as readonly string[]).includes(o.estadoLogistica)).length;
  const actual = GRUPOS_FILTRO.find((g) => g.id === grupo) ?? GRUPOS_FILTRO[0];
  const filas = actual.estados === null ? buscadas : buscadas.filter((o) => (actual.estados as readonly string[]).includes(o.estadoLogistica));
  const abrirDe = (servicioId: number) => (abierto && 'o' in abierto && abierto.o.servicioId === servicioId ? abierto : null);
  const unica = auto && opInicial ? filas.find((o) => o.numero === opInicial) : undefined;

  return (
    <div className="space-y-5">
      <Encabezado titulo="Operaciones" subtitulo="Operación · Logística">
        <span className="flex items-center gap-1.5 text-xs text-tinta-suave">
          <span className={cn('size-2 rounded-full', vivo === 'en_vivo' ? 'bg-exito' : 'bg-[#fdb022]')} />
          {vivo === 'en_vivo' ? 'En vivo' : 'Actualiza cada minuto'}
        </span>
        <Link href="/operacion/viajes" className={BOTON_SECUNDARIO}>
          Viajes
        </Link>
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

      <section className={cn(TARJETA, 'space-y-3 p-4')}>
        <h2 className="text-sm font-semibold text-tinta">Filtros</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-xs text-tinta-suave">
            Fecha desde
            <input type="date" className={CONTROL_FILTRO} value={desde} onChange={(e) => setDesde(e.target.value)} />
          </label>
          <label className="grid gap-1 text-xs text-tinta-suave">
            Fecha hasta
            <input type="date" className={CONTROL_FILTRO} value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </label>
          <label className="relative block w-full max-w-xs">
            <span className="sr-only">Buscar</span>
            <Search className="absolute top-2.5 left-2.5 size-4 text-tinta-suave" />
            <input
              type="search"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Nro., cliente, contenedor, chofer, CRT…"
              className={cn(CONTROL_FILTRO, 'w-full pl-8')}
            />
          </label>
        </div>
        <p className="text-xs text-tinta-suave">
          Las operaciones abiertas (sin confirmar, programadas y en curso) se ven siempre; las fechas filtran las entregadas y canceladas.
        </p>
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
      </section>

      <div className={cn(TARJETA, 'overflow-x-auto')}>
        {isPending ? (
          <Cargando texto="Cargando operaciones…" />
        ) : isError ? (
          <ErrorLectura texto="No se pudieron cargar las operaciones." onReintentar={() => refetch()} />
        ) : filas.length === 0 ? (
          <Vacio
            icono={<ClipboardList className="size-5" />}
            texto={(data ?? []).length === 0 ? 'No hay operaciones en esas fechas.' : 'Ninguna operación coincide con el filtro.'}
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-borde bg-fondo">
              <tr>
                <th className={TH}>Nro. Op.</th>
                <th className={TH}>Fecha</th>
                <th className={TH}>Tipo</th>
                <th className={TH}>Cliente</th>
                <th className={TH}>Línea</th>
                <th className={TH}>Presentación</th>
                <th className={TH}>Inicio</th>
                <th className={TH}>Fin</th>
                <th className={TH}>Estado</th>
                <th className={TH}>Chofer · equipo</th>
                <th className={TH}>Contenedor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {filas.map((o) => (
                <FilaOperacion
                  key={o.servicioId}
                  o={o}
                  zona={zonaHoraria}
                  puede={puede}
                  abierto={abrirDe(o.servicioId) ?? (unica?.servicioId === o.servicioId ? { tipo: 'detalle', o } : null)}
                  onAbrir={setAbierto}
                />
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
  const sinEquipo = !o.tramoId && !o.transportistaId;
  const vencida = o.fechaEntrega && !['entregado', 'cancelado'].includes(o.estadoLogistica) && new Date(o.fechaEntrega).getTime() < Date.now();
  return (
    <>
      <tr className={cn('cursor-pointer hover:bg-hover/60', abierto && 'bg-marca-suave/50')} onClick={() => onAbrir(abierto ? null : { tipo: 'detalle', o })}>
        <td className={cn(TD, 'font-mono font-semibold')}>
          <button type="button" className="text-marca hover:underline" aria-expanded={!!abierto}>
            {o.numero}
          </button>
        </td>
        <td className={cn(TD, 'whitespace-nowrap')}>{formatearFechaDia(o.fecha)}</td>
        <td className={cn(TD, 'text-xs')}>{etiquetaTipo(o.tipo)}</td>
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
        <td className={cn(TD, 'whitespace-nowrap')}>{diaHora(o.inicioReal, zona)}</td>
        <td className={cn(TD, 'whitespace-nowrap', vencida && 'font-semibold text-error')}>
          {o.finReal ? diaHora(o.finReal, zona) : o.fechaEntrega ? <span className="text-tinta-suave">prog. {diaHora(o.fechaEntrega, zona)}</span> : '—'}
        </td>
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
        </td>
      </tr>
      {abierto && (
        <tr>
          <td colSpan={11} className="px-3 pb-4">
            <Detalle o={o} zona={zona} puede={puede} abierto={abierto} onAbrir={onAbrir} />
          </td>
        </tr>
      )}
    </>
  );
}

// ------------------------------------------------------------------ ficha

const SOLAPAS = ['Fechas', 'Detalle', 'Vehículos', 'Mercadería y contenedor', 'Carga'] as const;
type Solapa = (typeof SOLAPAS)[number];

function Dato({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-tinta-suave">{label}</dt>
      <dd className={cn('text-sm text-tinta', mono && 'font-mono')}>{children === null || children === undefined || children === '' ? '—' : children}</dd>
    </div>
  );
}

function Detalle({ o, zona, puede, abierto, onAbrir }: { o: Operacion; zona: string; puede: boolean; abierto: Abierto; onAbrir: (a: Abierto) => void }) {
  const [solapa, setSolapa] = useState<Solapa>('Fechas');
  const confirmar = useConfirmarOperacion();
  const envioConfirmar = useEnvio();
  const cerrar = () => onAbrir({ tipo: 'detalle', o });
  const tipo = abierto?.tipo;
  const abiertaOp = esAbierta(o);
  const cerrada = ['entregado', 'facturado', 'cancelado'].includes(o.estado);

  const botones: { id: Exclude<NonNullable<Abierto>['tipo'], 'nueva' | 'detalle'> | 'duplicar' | 'confirmar'; etiqueta: string; principal?: boolean }[] =
    puede
      ? [
          ...(o.estado === 'sin_confirmar' ? [{ id: 'confirmar' as const, etiqueta: 'Confirmar', principal: true }] : []),
          ...(o.estado === 'planificado' && !o.transportistaId
            ? [{ id: 'equipo' as const, etiqueta: o.tramoId ? 'Cambiar equipo' : 'Asignar equipo', principal: !o.tramoId }]
            : []),
          ...(!o.tramoId && ['sin_confirmar', 'planificado', 'en_curso'].includes(o.estado)
            ? [{ id: 'tercero' as const, etiqueta: o.transportistaId ? 'Transportista externo' : 'Hace un externo' }]
            : []),
          ...(!['sin_confirmar', 'facturado', 'cancelado'].includes(o.estado) ? [{ id: 'hito' as const, etiqueta: 'Registrar fecha' }] : []),
          ...(o.estado !== 'facturado' && o.estado !== 'cancelado' ? [{ id: 'modificar' as const, etiqueta: abiertaOp ? 'Modificar' : 'Documentación' }] : []),
          { id: 'duplicar' as const, etiqueta: 'Duplicar' },
          ...(abiertaOp ? [{ id: 'cancelar' as const, etiqueta: 'Cancelar operación' }] : []),
        ]
      : [];

  return (
    <div className="space-y-3 rounded-lg border border-borde bg-fondo/40 p-4" onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-tinta">
            Operación {o.numero} · {etiquetaTipo(o.tipo)}
          </h3>
          <p className="text-sm text-tinta-suave">
            {o.cliente}
            {o.linea && ` · Línea ${o.linea}`}
            {o.motivoCancelacion && ` · Cancelada: ${o.motivoCancelacion}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {o.tramoId && (
            <Link href={`/operacion/viajes?tramo=${o.tramoId}`} className="inline-flex h-8 items-center rounded-md px-2.5 text-xs font-medium text-marca hover:underline">
              Pasos del viaje
              {o.paso && esPaso(o.paso) && <span className={cn('ml-1.5 rounded-[3px] px-1.5', PASO_INFO[o.paso].clase)}>{PASO_INFO[o.paso].etiqueta}</span>}
            </Link>
          )}
          {botones.map((b) => (
            <button
              key={b.id}
              type="button"
              disabled={b.id === 'confirmar' && confirmar.isPending}
              onClick={() => {
                if (b.id === 'confirmar') void envioConfirmar.enviar(confirmar.mutateAsync({ servicioId: o.servicioId }), () => undefined);
                else if (b.id === 'duplicar') onAbrir({ tipo: 'nueva', base: o });
                else onAbrir(tipo === b.id ? { tipo: 'detalle', o } : { tipo: b.id, o });
              }}
              className={cn(
                'inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-medium',
                b.principal ? 'bg-marca text-white hover:bg-marca/90' : 'border border-borde bg-panel text-tinta hover:bg-hover',
              )}
            >
              {b.id === 'confirmar' && confirmar.isPending && <LoaderCircle className="size-3.5 animate-spin" />}
              {b.id === 'duplicar' && <Copy className="size-3.5" />}
              {b.etiqueta}
            </button>
          ))}
        </div>
      </div>
      <ErrorBase error={envioConfirmar.error} />

      {tipo === 'modificar' && <FormOperacion base={o} zona={zona} onCerrar={cerrar} />}
      {tipo === 'equipo' && <PanelEquipo o={o} onCerrar={cerrar} />}
      {tipo === 'tercero' && <PanelTercero o={o} onCerrar={cerrar} />}
      {tipo === 'hito' && <PanelHito o={o} zona={zona} onCerrar={cerrar} />}
      {tipo === 'cancelar' && <PanelCancelar o={o} onCerrar={cerrar} />}

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Dato label="Lugar retiro">{o.lugarRetiro}</Dato>
        <Dato label="Lugar carga">{o.origen}</Dato>
        <Dato label="Lugar aduana">{o.lugarAduana}</Dato>
        <Dato label="Lugar entrega">{o.destino}</Dato>
      </dl>

      <div role="tablist" className="flex flex-wrap gap-1 border-b border-borde">
        {SOLAPAS.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={solapa === s}
            onClick={() => setSolapa(s)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm',
              solapa === s ? 'border-marca font-medium text-marca' : 'border-transparent text-tinta-suave hover:text-tinta',
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {solapa === 'Fechas' && <SolapaFechas o={o} zona={zona} puede={puede && !cerrada} />}
      {solapa === 'Detalle' && (
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Dato label="Op. Ref. · BL · Booking" mono>
            {o.booking}
          </Dato>
          <Dato label="Nro. PO · JO">{o.referenciaCliente}</Dato>
          <Dato label="Buque">{o.buque}</Dato>
          <Dato label="Fecha de la operación">{formatearFechaDia(o.fecha)}</Dato>
        </dl>
      )}
      {solapa === 'Vehículos' && (
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Dato label="Transportista">{o.transportista ?? (o.tramoId ? 'TRANSPORTES CALDERÓN' : null)}</Dato>
          <Dato label="Chofer">{o.chofer}</Dato>
          <Dato label="Patente camión" mono>
            {o.tractor}
          </Dato>
          <Dato label="Patente remolque" mono>
            {o.semi}
          </Dato>
        </dl>
      )}
      {solapa === 'Mercadería y contenedor' && (
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Dato label="Mercadería">{o.producto}</Dato>
          <Dato label="Contenedor">{o.tipoContenedor}</Dato>
          <Dato label="Número de contenedor" mono>
            {o.contenedor}
          </Dato>
          <Dato label="Nro. precinto" mono>
            {o.precinto}
          </Dato>
          <Dato label="Peso bruto (kg)">{o.pesoKg === null ? null : o.pesoKg.toLocaleString('es-AR')}</Dato>
          <Dato label="Tara que pide">{o.taraMaxDias ? `${o.taraMaxDias} días` : null}</Dato>
        </dl>
      )}
      {solapa === 'Carga' && (
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Dato label="C.R.T." mono>
            {o.crt}
          </Dato>
          <Dato label="M.I.C." mono>
            {o.mic}
          </Dato>
          <div className="sm:col-span-2">
            <Dato label="Observaciones">{o.observacion}</Dato>
          </div>
        </dl>
      )}
    </div>
  );
}

function SolapaFechas({ o, zona, puede }: { o: Operacion; zona: string; puede: boolean }) {
  const anular = useAnularHito();
  const terminar = useTerminarDemora();
  const { error, enviar } = useEnvio();
  const hito = (t: TipoHito) => o.hitos.find((h) => h.tipo === t);
  const propios: { label: string; valor: string | null }[] = [
    { label: 'Fecha presentación', valor: o.fechaPresentacion },
    { label: o.transportistaId ? 'Inicio (carga)' : 'Inicio (salió)', valor: o.inicioReal },
    { label: 'Fin (entrega)', valor: o.finReal },
    { label: 'Entrega programada', valor: o.fechaEntrega },
  ];
  const demoras = o.hitos.filter((h) => h.tipo === 'demora');
  const abierta = demoras.find((d) => !d.hasta);
  return (
    <div className="space-y-3">
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {propios.map((p) => (
          <Dato key={p.label} label={p.label}>
            {p.valor ? diaHora(p.valor, zona) : null}
          </Dato>
        ))}
        {TIPOS_HITO.filter((t) => t !== 'demora' && (o.transportistaId || (t !== 'carga' && t !== 'entrega'))).map((t) => {
          const h = hito(t);
          return (
            <Dato key={t} label={HITO_ETIQUETA[t]}>
              {h ? (
                <>
                  {diaHora(h.ts, zona)}
                  {h.detalle && <span className="block text-xs text-tinta-suave">{h.detalle}</span>}
                  {puede && (
                    <button
                      type="button"
                      className="ml-2 text-xs text-marca hover:underline"
                      disabled={anular.isPending}
                      onClick={() => void enviar(anular.mutateAsync({ hitoId: h.id }), () => undefined)}
                    >
                      Anular
                    </button>
                  )}
                </>
              ) : null}
            </Dato>
          );
        })}
      </dl>
      {demoras.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-tinta-suave">Demoras</p>
          <ul className="space-y-1 text-sm">
            {demoras.map((d) => (
              <li key={d.id}>
                {diaHora(d.ts, zona)} → {d.hasta ? diaHora(d.hasta, zona) : <span className="font-semibold text-[#b54708]">sigue demorado</span>}
                {d.detalle && <span className="text-tinta-suave"> · {d.detalle}</span>}
                {puede && (
                  <button
                    type="button"
                    className="ml-2 text-xs text-marca hover:underline"
                    disabled={anular.isPending}
                    onClick={() => void enviar(anular.mutateAsync({ hitoId: d.id }), () => undefined)}
                  >
                    Anular
                  </button>
                )}
              </li>
            ))}
          </ul>
          {abierta && puede && (
            <button
              type="button"
              className={BOTON_SECUNDARIO}
              disabled={terminar.isPending}
              onClick={() => void enviar(terminar.mutateAsync({ servicioId: o.servicioId, hasta: null }), () => undefined)}
            >
              {terminar.isPending && <LoaderCircle className="size-4 animate-spin" />} Terminó la demora (ahora)
            </button>
          )}
        </div>
      )}
      <ErrorBase error={error} />
    </div>
  );
}

// -------------------------------------------------------------- formulario

const vacioForm = (zona: string) => ({
  sinConfirmar: false,
  tipoOperacion: '',
  fechaOperacion: hoyEnZona(zona),
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
  precinto: '',
  taraMaxDias: '',
  booking: '',
  referenciaCliente: '',
  buque: '',
  crt: '',
  mic: '',
  observacion: '',
});

const SOLAPAS_FORM = ['Operación', 'Fechas', 'Detalle', 'Mercadería y contenedor', 'Carga'] as const;
type SolapaForm = (typeof SOLAPAS_FORM)[number];
const CAMPOS_DE: Record<SolapaForm, string[]> = {
  Operación: ['tipoOperacion', 'fechaOperacion', 'clienteId', 'lineaId', 'lugarRetiroId', 'origenId', 'lugarAduanaId', 'destinoId'],
  Fechas: ['fechaPresentacion', 'fechaEntrega'],
  Detalle: ['booking', 'referenciaCliente', 'buque'],
  'Mercadería y contenedor': ['producto', 'tipoContenedor', 'contenedor', 'precinto', 'pesoKg', 'taraMaxDias'],
  Carga: ['crt', 'mic', 'observacion'],
};

/** Alta, modificación o duplicado. Con «duplicar», copia todo salvo contenedor, precinto, CRT y MIC (uno por contenedor). */
function FormOperacion({ base, duplicar, zona, onCerrar }: { base?: Operacion; duplicar?: boolean; zona: string; onCerrar: () => void }) {
  const guardar = useGuardarOperacion();
  const { data: op } = useOpcionesViaje();
  const { data: lineas } = useLineas();
  const { error, enviar, campo } = useEnvio();
  const [solapa, setSolapa] = useState<SolapaForm>('Operación');
  const editar = !!base && !duplicar;
  const soloDocs = editar && !esAbierta(base);
  const [f, setF] = useState(() => {
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
  const set = (k: keyof typeof f) => (val: string) => setF((p) => ({ ...p, [k]: val }));
  const ev = (k: keyof typeof f) => (e: { target: { value: string } }) => set(k)(e.target.value);
  /** Elegir la línea completa los lugares (la base hace lo mismo con los que queden vacíos). */
  const elegirLinea = (id: string) => {
    const l = lineas?.find((x) => String(x.id) === id);
    setF((p) =>
      l
        ? {
            ...p,
            lineaId: id,
            lugarRetiroId: String(l.lugarRetiroId),
            origenId: String(l.lugarRetiroId),
            lugarAduanaId: l.lugarAduanaId ? String(l.lugarAduanaId) : '',
            destinoId: String(l.lugarEntregaId),
          }
        : { ...p, lineaId: id },
    );
  };
  const opLineas = lineas?.filter((l) => l.activa || String(l.id) === f.lineaId).map((l) => ({ id: l.id, nombre: l.codigo }));
  const conError = (s: SolapaForm) => CAMPOS_DE[s].some((c) => campo(c));
  const bloqueado = soloDocs;

  const enviarForm = () =>
    enviar(
      guardar.mutateAsync({
        ...f,
        servicioId: editar ? base.servicioId : null,
        versionFila: editar ? base.versionFila : null,
        tipoOperacion: f.tipoOperacion as OperacionEntrada['tipoOperacion'],
        fechaPresentacion: aIso(f.fechaPresentacion, zona),
        fechaEntrega: aIso(f.fechaEntrega, zona),
      }),
      onCerrar,
    );

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
      <h3 className="font-medium text-tinta">
        {editar ? (soloDocs ? `Documentación de la operación ${base.numero}` : `Modificar la operación ${base.numero}`) : base ? `Duplicar la operación ${base.numero}` : 'Nueva operación'}
      </h3>
      <p className="text-sm text-tinta-suave">
        {soloDocs
          ? 'Ya salió: se completan la documentación, la mercadería y la entrega programada.'
          : base && !editar
            ? 'Copia todo menos contenedor, precinto, CRT y MIC. El equipo se asigna después.'
            : 'El equipo (semi, tractor y chofer) se asigna después, desde la ficha. Con la línea se completan los lugares.'}
      </p>

      <div role="tablist" className="flex flex-wrap gap-1 border-b border-borde">
        {SOLAPAS_FORM.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={solapa === s}
            onClick={() => setSolapa(s)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm',
              solapa === s ? 'border-marca font-medium text-marca' : 'border-transparent text-tinta-suave hover:text-tinta',
            )}
          >
            {s}
            {conError(s) && <span className="ml-1 inline-block size-1.5 rounded-full bg-error align-middle" aria-label="con errores" />}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {solapa === 'Operación' && (
          <>
            <Campo label="Tipo de operación *" error={campo('tipoOperacion')}>
              <select value={f.tipoOperacion} onChange={ev('tipoOperacion')} disabled={bloqueado}>
                <option value="">Elegí…</option>
                {TIPOS_OPERACION.map((t) => (
                  <option key={t} value={t}>
                    {TIPO_OPERACION_ETIQUETA[t]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Fecha de la operación" error={campo('fechaOperacion')}>
              <input type="date" value={f.fechaOperacion} onChange={ev('fechaOperacion')} disabled={bloqueado} />
            </Campo>
            {!editar && (
              <label className="flex items-center gap-2 self-end pb-2 text-sm text-tinta">
                <input type="checkbox" checked={f.sinConfirmar} onChange={(e) => setF((p) => ({ ...p, sinConfirmar: e.target.checked }))} />
                Sin confirmar (el cliente todavía no la confirmó)
              </label>
            )}
            <Campo label="Cliente *" error={campo('clienteId')}>
              <Lista valor={f.clienteId} opciones={op?.clientes} onCambiar={set('clienteId')} disabled={bloqueado} />
            </Campo>
            <Campo label="Línea" error={campo('lineaId')} ayuda="SAI-BSAS, MZA-VALP… Completa los lugares.">
              <Lista valor={f.lineaId} opciones={opLineas} onCambiar={elegirLinea} vacio="Sin línea" disabled={bloqueado} />
            </Campo>
            <Campo label="Lugar retiro" error={campo('lugarRetiroId')} ayuda="Dónde se retira el contenedor.">
              <Lista valor={f.lugarRetiroId} opciones={op?.lugares} onCambiar={set('lugarRetiroId')} vacio="—" disabled={bloqueado} />
            </Campo>
            <Campo label="Lugar carga" error={campo('origenId')} ayuda="Vacío = el de retiro.">
              <Lista valor={f.origenId} opciones={op?.lugares} onCambiar={set('origenId')} vacio="—" disabled={bloqueado} />
            </Campo>
            <Campo label="Lugar aduana" error={campo('lugarAduanaId')}>
              <Lista valor={f.lugarAduanaId} opciones={op?.lugares} onCambiar={set('lugarAduanaId')} vacio="—" disabled={bloqueado} />
            </Campo>
            <Campo label="Lugar entrega" error={campo('destinoId')}>
              <Lista valor={f.destinoId} opciones={op?.lugares} onCambiar={set('destinoId')} vacio="—" disabled={bloqueado} />
            </Campo>
          </>
        )}
        {solapa === 'Fechas' && (
          <>
            <Campo label="Fecha presentación" error={campo('fechaPresentacion')} ayuda="Cuándo se presenta a cargar.">
              <input type="datetime-local" value={f.fechaPresentacion} onChange={ev('fechaPresentacion')} disabled={bloqueado} />
            </Campo>
            <Campo label="Entrega programada" error={campo('fechaEntrega')}>
              <input type="datetime-local" value={f.fechaEntrega} onChange={ev('fechaEntrega')} />
            </Campo>
            <p className="self-end pb-2 text-xs text-tinta-suave sm:col-span-2 lg:col-span-1">
              Retiro de contenedor, aduana y frontera se registran desde la ficha, en «Registrar fecha».
            </p>
          </>
        )}
        {solapa === 'Detalle' && (
          <>
            <Campo label="Op. Ref. · BL · Booking" error={campo('booking')}>
              <input className="uppercase" maxLength={60} value={f.booking} onChange={ev('booking')} />
            </Campo>
            <Campo label="Nro. PO · JO" error={campo('referenciaCliente')}>
              <input maxLength={60} value={f.referenciaCliente} onChange={ev('referenciaCliente')} />
            </Campo>
            <Campo label="Buque" error={campo('buque')}>
              <input className="uppercase" maxLength={100} value={f.buque} onChange={ev('buque')} />
            </Campo>
          </>
        )}
        {solapa === 'Mercadería y contenedor' && (
          <>
            <Campo label="Mercadería" error={campo('producto')}>
              <input maxLength={200} value={f.producto} onChange={ev('producto')} placeholder="Banana, vino, madera…" />
            </Campo>
            <Campo label="Contenedor (tipo)" error={campo('tipoContenedor')} ayuda="40 REEFER, 20 DRY…">
              <input className="uppercase" maxLength={30} value={f.tipoContenedor} onChange={ev('tipoContenedor')} list="tipos-contenedor" />
            </Campo>
            <Campo label="Número de contenedor" error={campo('contenedor')} ayuda="4 letras y 7 números (TCLU1066314).">
              <input className="uppercase" maxLength={20} value={f.contenedor} onChange={ev('contenedor')} />
            </Campo>
            <Campo label="Nro. precinto" error={campo('precinto')}>
              <input className="uppercase" maxLength={60} value={f.precinto} onChange={ev('precinto')} />
            </Campo>
            <Campo label="Peso bruto (kg)" error={campo('pesoKg')}>
              <input inputMode="decimal" value={f.pesoKg} onChange={ev('pesoKg')} />
            </Campo>
            <Campo label="Tara que pide (días)" error={campo('taraMaxDias')} ayuda="Vacío si la carga no pide.">
              <input inputMode="numeric" value={f.taraMaxDias} onChange={ev('taraMaxDias')} disabled={bloqueado} />
            </Campo>
            <datalist id="tipos-contenedor">
              {['20 DRY', '40 DRY', '40 HC', '20 REEFER', '40 REEFER', '40 HC REEFER'].map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </>
        )}
        {solapa === 'Carga' && (
          <>
            <Campo label="C.R.T." error={campo('crt')}>
              <input className="uppercase" maxLength={60} value={f.crt} onChange={ev('crt')} />
            </Campo>
            <Campo label="M.I.C." error={campo('mic')}>
              <input className="uppercase" maxLength={60} value={f.mic} onChange={ev('mic')} />
            </Campo>
            <div className="sm:col-span-2 lg:col-span-3">
              <Campo label="Observaciones" error={campo('observacion')}>
                <textarea rows={3} maxLength={2000} value={f.observacion} onChange={ev('observacion')} />
              </Campo>
            </div>
          </>
        )}
      </div>

      <ErrorBase error={error} />
      <div className="flex flex-wrap gap-3">
        <button type="submit" className={BOTON_PRIMARIO} disabled={guardar.isPending}>
          {guardar.isPending && <LoaderCircle className="size-4 animate-spin" />} {editar ? 'Guardar cambios' : 'Dar de alta'}
        </button>
        <button type="button" className={BOTON_SECUNDARIO} onClick={onCerrar} disabled={guardar.isPending}>
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
      explicacion="Queda el viaje planificado: en la Pizarra el semi se ve «Asignado» y los pasos se marcan en Viajes."
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
      <Campo label="Observación del viaje" error={campo('observacion')}>
        <input maxLength={500} value={f.observacion} onChange={(e) => set('observacion')(e.target.value)} />
      </Campo>
      {o.tramoId && (
        <div className="self-end pb-1">
          <button
            type="button"
            className="text-sm text-marca hover:underline"
            disabled={quitar.isPending}
            onClick={() => void enviar(quitar.mutateAsync({ servicioId: o.servicioId, motivo: '' }), onCerrar)}
          >
            Quitar equipo (queda sin equipo)
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
          Para cuando la hace un fletero. No aparece en la Pizarra; la carga y la entrega se registran en «Registrar fecha». Sin
          transportista, vuelve a ser de Calderón. Los transportistas se cargan en{' '}
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

function PanelHito({ o, zona, onCerrar }: { o: Operacion; zona: string; onCerrar: () => void }) {
  const registrar = useRegistrarHito();
  const { error, enviar, campo } = useEnvio();
  const cargados = new Set(o.hitos.filter((h) => h.tipo !== 'demora').map((h) => h.tipo));
  const tipos = TIPOS_HITO.filter(
    (t) => (o.transportistaId || (t !== 'carga' && t !== 'entrega')) && (t === 'demora' || !cargados.has(t)),
  );
  const [f, setF] = useState({ tipo: tipos[0] ?? 'demora', momento: '', detalle: '' });
  return (
    <Panel
      titulo={`Registrar fecha · Op. ${o.numero}`}
      explicacion="Como la solapa «Fechas» de REDLINE. El estado de la operación se actualiza solo (Retirado, Aduana, Demorado…)."
      error={error}
      ocupado={registrar.isPending}
      textoBoton="Registrar"
      onCerrar={onCerrar}
      onConfirmar={() =>
        enviar(registrar.mutateAsync({ servicioId: o.servicioId, tipo: f.tipo, momento: aIso(f.momento, zona), detalle: f.detalle }), onCerrar)
      }
    >
      <Campo label="Qué pasó *" error={campo('tipo')}>
        <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as TipoHito })}>
          {tipos.map((t) => (
            <option key={t} value={t}>
              {HITO_ETIQUETA[t]}
              {t === 'demora' ? ' (empieza)' : ''}
            </option>
          ))}
        </select>
      </Campo>
      <Campo label="Fecha y hora" error={campo('momento')} ayuda="Vacío = ahora.">
        <input type="datetime-local" value={f.momento} onChange={(e) => setF({ ...f, momento: e.target.value })} />
      </Campo>
      <Campo label="Detalle" error={campo('detalle')} ayuda={f.tipo === 'demora' ? 'Motivo de la demora.' : undefined}>
        <input maxLength={500} value={f.detalle} onChange={(e) => setF({ ...f, detalle: e.target.value })} />
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
      explicacion="Solo si todavía no salió. Si tenía equipo asignado, su viaje planificado también se cancela."
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
