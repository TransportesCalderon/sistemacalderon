'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Search, Truck, X } from 'lucide-react';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { Cargando, ErrorLectura, Vacio } from '@/modules/combustible/components/comun/ui';
import { cn } from '@/shared/lib/cn';
import { TARJETA } from '@/shared/ui/clases';
import {
  clasificarDescarga,
  filtrar,
  FILTROS_VACIOS,
  hayFiltros,
  nivelFila,
  opciones,
  type FiltroDescarga,
  type FiltrosPizarra,
} from '../domain/pizarra.filtros';
import { ESTADO_INFO, ESTADOS_UNIDAD, type EstadoUnidad, type FilaPizarra } from '../domain/pizarra.types';
import { useColumnasAccesorio, useLugares, usePizarra, usePizarraEnVivo } from '../queries/hooks';
import { TablaPizarra } from './tabla-pizarra';

/** Si no llegan datos nuevos en este tiempo, la pantalla avisa que lo que muestra es viejo. */
const DATOS_VIEJOS_MS = 2 * 60_000;
/** Cuánto queda resaltada una fila que cambió. */
const RESALTE_MS = 10_000;

/** Lo que cuenta como «cambió la fila»: sin la ubicación, que se mueve con cada lectura de telemetría. */
const firma = (f: FilaPizarra) => JSON.stringify({ ...f, ubicacion: null, ubicacionTs: null });

/**
 * Flota > Pizarra Azul. Reemplaza la planilla PIZARRA SEMI GENSET: una fila por semi, en el orden
 * fijo de la patente, con lo que asignó Logística. Se actualiza sola (Supabase Realtime).
 */
export function PizarraPantalla() {
  const { zonaHoraria } = useSesion();
  const puedeEditar = useCan('flota.pizarra:editar');
  const vivo = usePizarraEnVivo();
  const { data, isPending, isError, refetch, dataUpdatedAt } = usePizarra();
  const { data: columnas } = useColumnasAccesorio();
  const { data: lugares } = useLugares();
  const [f, setF] = useState<FiltrosPizarra>(FILTROS_VACIOS);
  const [abierto, setAbierto] = useState<number | null>(null);
  const [grande, setGrande] = useState(false);
  const [verAccesorios, setVerAccesorios] = useState(true);
  const [ahora, setAhora] = useState(() => Date.now());
  const buscador = useRef<HTMLInputElement>(null);
  const recientes = useRecientes(data);

  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  // «/» lleva al buscador desde cualquier lugar de la pantalla.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === '/' && !(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT'))) {
        e.preventDefault();
        buscador.current?.focus();
      }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, []);

  const filas = useMemo(() => data ?? [], [data]);
  const visibles = useMemo(() => filtrar(filas, f, zonaHoraria, new Date(ahora)), [filas, f, zonaHoraria, ahora]);
  const criticas = filas.flatMap((x) =>
    x.alertas.filter((a) => a.nivel === 'critico').map((a) => ({ patente: x.patente, id: x.semiId, texto: a.texto })),
  );
  const viejos = dataUpdatedAt > 0 && ahora - dataUpdatedAt > DATOS_VIEJOS_MS;
  const set = <K extends keyof FiltrosPizarra>(k: K, v: FiltrosPizarra[K]) => setF((x) => ({ ...x, [k]: v }));

  return (
    <div className="-mx-4 -mt-6 flex min-h-[calc(100vh-4rem)] flex-col sm:-mx-6 lg:-mx-8">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-[#1f3a5f] px-4 py-2 text-white sm:px-6 lg:px-8 lg:px-8">
        <div className="flex items-baseline gap-2">
          <span className="text-xs text-[#a9bdd6]">Flota ›</span>
          <h1 className="text-lg font-bold">Pizarra Azul</h1>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-[#d5e2f1]">
          <span className={cn('size-2 rounded-full', vivo === 'en_vivo' ? 'bg-[#4ade80]' : 'bg-[#fdb022]')} />
          {vivo === 'en_vivo' ? 'En vivo' : vivo === 'conectando' ? 'Conectando…' : 'Reconectando… (se actualiza cada minuto)'}
        </span>
        <span className="flex-1" />
        <nav className="flex flex-wrap gap-3 text-xs text-[#d5e2f1]">
          <Link href="/flota/semirremolques" className="hover:text-white hover:underline">
            Semirremolques
          </Link>
          <Link href="/flota/gensets" className="hover:text-white hover:underline">
            Gensets
          </Link>
          <Link href="/flota/accesorios" className="hover:text-white hover:underline">
            Tipos de accesorio
          </Link>
        </nav>
        <Interruptor activo={verAccesorios} onCambiar={setVerAccesorios}>
          Accesorios
        </Interruptor>
        <Interruptor activo={grande} onCambiar={setGrande}>
          Letra grande
        </Interruptor>
      </header>

      {viejos && (
        <div role="alert" className="bg-error px-4 py-2 text-center text-sm font-bold text-white">
          DATOS DE HACE {Math.round((ahora - dataUpdatedAt) / 60_000)} MIN: no se pudo actualizar la pizarra. Revisá la conexión.
        </div>
      )}

      <section aria-label="Resumen por estado" className="flex flex-wrap border-b border-[#c9d1dc] bg-panel">
        <Contador
          etiqueta="Todas"
          n={filas.length}
          activo={f.estados.length === 0 && !f.soloAlertas && !f.descarga}
          onClick={() => setF({ ...f, estados: [], soloAlertas: false, descarga: '' })}
        />
        {ESTADOS_UNIDAD.map((e) => (
          <Contador
            key={e}
            etiqueta={ESTADO_INFO[e].etiqueta}
            muestra={ESTADO_INFO[e].clase}
            n={filas.filter((x) => x.estado === e).length}
            activo={f.estados.includes(e)}
            onClick={() => set('estados', alternar(f.estados, e))}
          />
        ))}
        <span className="flex-1 border-r border-borde" />
        <Contador
          etiqueta="Con alertas"
          n={filas.filter((x) => nivelFila(x)).length}
          color="text-error"
          activo={f.soloAlertas}
          onClick={() => set('soloAlertas', !f.soloAlertas)}
        />
        <Contador
          etiqueta="Descargan hoy"
          n={filas.filter((x) => clasificarDescarga(x.descarga, zonaHoraria, new Date(ahora)) === 'hoy').length}
          color="text-[#0b4a85]"
          activo={f.descarga === 'hoy'}
          onClick={() => set('descarga', f.descarga === 'hoy' ? '' : 'hoy')}
        />
      </section>

      {criticas.length > 0 && (
        <section
          aria-label="Atención"
          className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[#f3c3bd] bg-[#fdecea] px-4 py-1.5 text-[13px] text-error sm:px-6 lg:px-8 lg:px-8"
        >
          <span className="font-bold tracking-wide uppercase">Atención</span>
          {criticas.slice(0, 8).map((c, i) => (
            <button key={`${c.id}-${i}`} type="button" className="hover:underline" onClick={() => setAbierto(c.id)}>
              <span className="font-mono font-semibold">{c.patente}</span> {c.texto}
            </button>
          ))}
          {criticas.length > 8 && <span>y {criticas.length - 8} más</span>}
        </section>
      )}

      <section
        aria-label="Búsqueda y filtros"
        className="flex flex-wrap items-end gap-2.5 border-b border-[#c9d1dc] bg-[#f7f9fc] px-4 py-2.5 sm:px-6 lg:px-8 lg:px-8"
      >
        <label className="relative block w-full max-w-sm">
          <span className="sr-only">Buscar</span>
          <Search className="absolute top-2 left-2.5 size-4 text-tinta-suave" />
          <input
            ref={buscador}
            type="search"
            value={f.q}
            onChange={(e) => set('q', e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') set('q', '');
              if (e.key === 'Enter' && visibles.length === 1) setAbierto(visibles[0]!.semiId);
            }}
            placeholder="Patente, chofer, contenedor o cliente   ( / )"
            className="h-8 w-full rounded border border-[#8aa3c2] bg-panel pr-2 pl-8 text-sm outline-none focus:border-marca"
          />
        </label>
        <Lista etiqueta="Cliente" valor={f.cliente} opciones={opciones(filas, (x) => x.cliente)} onCambiar={(v) => set('cliente', v)} />
        <Lista etiqueta="Chofer" valor={f.chofer} opciones={opciones(filas, (x) => x.chofer)} onCambiar={(v) => set('chofer', v)} />
        <Lista etiqueta="Tractor" valor={f.tractor} opciones={opciones(filas, (x) => x.tractor)} onCambiar={(v) => set('tractor', v)} />
        <Lista etiqueta="Semi" valor={f.semi} opciones={opciones(filas, (x) => x.patente)} onCambiar={(v) => set('semi', v)} />
        <label className="flex flex-col gap-0.5 text-[11px] font-semibold text-tinta-suave">
          Descarga
          <select value={f.descarga} onChange={(e) => set('descarga', e.target.value as FiltroDescarga)} className={SELECT}>
            <option value="">Todas</option>
            <option value="vencida">Vencidas</option>
            <option value="hoy">Hoy</option>
            <option value="manana">Mañana</option>
            <option value="futuro">Después</option>
            <option value="sin_fecha">Sin fecha</option>
          </select>
        </label>
        <Apto columnas={columnas ?? []} valor={f.apto} onCambiar={(v) => set('apto', v)} />
        {hayFiltros(f) && (
          <button
            type="button"
            className="mb-0.5 inline-flex h-7 items-center gap-1 rounded-full border border-marca px-3 text-xs text-marca"
            onClick={() => setF(FILTROS_VACIOS)}
          >
            <X className="size-3" /> Limpiar filtros
          </button>
        )}
        <span className="flex-1" />
        <span className="pb-1.5 text-xs text-tinta-suave">
          {visibles.length} de {filas.length} semis
        </span>
      </section>

      <main className="flex-1 px-4 pt-0 pb-4 sm:px-6 lg:px-8 lg:px-8">
        <div className={cn(TARJETA, 'max-h-[calc(100vh-15rem)] overflow-auto rounded-t-none border-t-0')}>
          {isPending ? (
            <Cargando texto="Cargando la pizarra…" />
          ) : isError && !data ? (
            <ErrorLectura texto="No se pudo leer la pizarra." onReintentar={() => refetch()} />
          ) : filas.length === 0 ? (
            <Vacio icono={<Truck className="size-5" />} texto="Todavía no hay semirremolques cargados.">
              <Link href="/flota/semirremolques" className="text-sm text-marca hover:underline">
                Cargar los semirremolques
              </Link>
            </Vacio>
          ) : visibles.length === 0 ? (
            <Vacio icono={<Search className="size-5" />} texto="Ningún semi coincide con la búsqueda y los filtros.">
              <button type="button" className="text-sm text-marca hover:underline" onClick={() => setF(FILTROS_VACIOS)}>
                Limpiar filtros
              </button>
            </Vacio>
          ) : (
            <TablaPizarra
              filas={visibles}
              columnas={columnas ?? []}
              verAccesorios={verAccesorios}
              grande={grande}
              zona={zonaHoraria}
              puedeEditar={puedeEditar}
              abierto={abierto}
              recientes={recientes}
              lugares={lugares ?? []}
              onAbrir={setAbierto}
            />
          )}
        </div>
        <Leyenda />
      </main>
    </div>
  );
}

const SELECT = 'h-7 max-w-[160px] rounded border border-[#c9d1dc] bg-panel px-1.5 text-xs text-tinta';

const alternar = (xs: EstadoUnidad[], e: EstadoUnidad) => (xs.includes(e) ? xs.filter((x) => x !== e) : [...xs, e]);

/** Semis cuyos datos cambiaron en los últimos 10 s (no cuenta la primera carga ni la ubicación). */
function useRecientes(filas: FilaPizarra[] | undefined): Set<number> {
  const previas = useRef<Map<number, string> | null>(null);
  const [recientes, setRecientes] = useState<Set<number>>(new Set());
  useEffect(() => {
    if (!filas) return;
    const nuevas = new Map(filas.map((x) => [x.semiId, firma(x)]));
    const antes = previas.current;
    previas.current = nuevas;
    if (!antes) return;
    const cambiadas = [...nuevas].filter(([id, v]) => antes.get(id) !== v).map(([id]) => id);
    if (cambiadas.length === 0) return;
    setRecientes((r) => new Set([...r, ...cambiadas]));
    // Sin limpieza a propósito: si llega otro cambio antes, este resalte igual se apaga a su tiempo.
    setTimeout(() => setRecientes((r) => new Set([...r].filter((id) => !cambiadas.includes(id)))), RESALTE_MS);
  }, [filas]);
  return recientes;
}

function Contador({
  etiqueta,
  n,
  activo,
  onClick,
  muestra,
  color,
}: {
  etiqueta: string;
  n: number;
  activo: boolean;
  onClick: () => void;
  muestra?: string;
  color?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={cn(
        'flex h-12 min-w-[92px] flex-col items-start justify-center border-r border-borde px-3 text-left hover:bg-[#f5f8fc]',
        activo && 'bg-marca-suave shadow-[inset_0_-3px_0_var(--color-marca)]',
      )}
    >
      <b className={cn('text-xl leading-6 font-bold tabular-nums', color ?? 'text-tinta')}>{n}</b>
      <span className="flex items-center gap-1.5 text-[11px] font-medium text-tinta-suave">
        {muestra && <i className={cn('inline-block size-2.5 rounded-[2px]', muestra)} />}
        {etiqueta}
      </span>
    </button>
  );
}

function Lista({
  etiqueta,
  valor,
  opciones,
  onCambiar,
}: {
  etiqueta: string;
  valor: string;
  opciones: string[];
  onCambiar: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-0.5 text-[11px] font-semibold text-tinta-suave">
      {etiqueta}
      <select value={valor} onChange={(e) => onCambiar(e.target.value)} className={SELECT}>
        <option value="">Todos</option>
        {opciones.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

/** «Apto para…»: semis con al menos N de un accesorio (por ejemplo, fajas para madera, nylon para pallets). */
function Apto({
  columnas,
  valor,
  onCambiar,
}: {
  columnas: { id: number; nombre: string; sigla: string }[];
  valor: FiltrosPizarra['apto'];
  onCambiar: (v: FiltrosPizarra['apto']) => void;
}) {
  const [tipo, setTipo] = useState('');
  const [minimo, setMinimo] = useState('1');
  if (columnas.length === 0) return null;
  const nombre = (id: number) => columnas.find((c) => c.id === id)?.sigla ?? `#${id}`;
  return (
    <div className="flex flex-col gap-0.5 text-[11px] font-semibold text-tinta-suave">
      Apto para (accesorios)
      <div className="flex flex-wrap items-center gap-1">
        {valor.map((r) => (
          <button
            key={r.tipoId}
            type="button"
            className="inline-flex h-7 items-center gap-1 rounded-full bg-[#1f3a5f] px-2.5 text-xs text-white"
            onClick={() => onCambiar(valor.filter((x) => x.tipoId !== r.tipoId))}
            title="Quitar"
          >
            {nombre(r.tipoId)} ≥ {r.minimo} <X className="size-3" />
          </button>
        ))}
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={SELECT} aria-label="Accesorio">
          <option value="">Accesorio…</option>
          {columnas
            .filter((c) => !valor.some((r) => r.tipoId === c.id))
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
        </select>
        <input
          aria-label="Mínimo"
          inputMode="numeric"
          value={minimo}
          onChange={(e) => setMinimo(e.target.value)}
          className="h-7 w-12 rounded border border-[#c9d1dc] bg-panel px-1.5 text-xs text-tinta"
        />
        <button
          type="button"
          disabled={!tipo || !/^\d+$/.test(minimo)}
          className="h-7 rounded border border-[#c9d1dc] bg-panel px-2 text-xs text-tinta disabled:opacity-50"
          onClick={() => {
            onCambiar([...valor, { tipoId: Number(tipo), minimo: Number(minimo) }]);
            setTipo('');
          }}
        >
          Agregar
        </button>
      </div>
    </div>
  );
}

function Interruptor({ activo, onCambiar, children }: { activo: boolean; onCambiar: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={() => onCambiar(!activo)}
      className={cn(
        'h-7 rounded border px-2.5 text-xs',
        activo ? 'border-white bg-white text-[#1f3a5f]' : 'border-[#3c5a80] bg-[#2b4b74] text-white',
      )}
    >
      {children}
    </button>
  );
}

function Leyenda() {
  return (
    <div className="flex flex-wrap items-center gap-3 pt-2 text-[11px] text-tinta-suave">
      {ESTADOS_UNIDAD.map((e) => (
        <span key={e} className={cn('rounded-[3px] px-1.5 py-0.5 font-semibold', ESTADO_INFO[e].clase)}>
          {ESTADO_INFO[e].etiqueta}
        </span>
      ))}
      <span className="flex-1" />
      <span>
        <b className="text-error">Rojo</b>: error de asignación o vencido · <b className="text-alerta">ámbar</b>: por vencer o a revisar ·
        fondo amarillo: cambió recién
      </span>
    </div>
  );
}
