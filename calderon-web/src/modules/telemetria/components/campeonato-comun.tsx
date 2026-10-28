'use client';

import { ChevronDown, ChevronUp, Gauge, Hand, OctagonAlert, Timer, Zap } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { formatearNumero } from '@/shared/lib/numeros';
import type { NivelHoy } from '../domain/flota.types';

/**
 * Piezas de la vista de campeonato (migraciones 107 y 108): podio, puestos ganados o perdidos, medallas y la ficha
 * con las subpuntuaciones de la marca. Los colores (verde, naranja, rojo) los decide la base; acá solo se pintan.
 */
export interface Sub {
  valor: number;
  nivel: NivelHoy | null;
}

export const nivelDe = (v: unknown): NivelHoy | null => (v === 'verde' || v === 'naranja' || v === 'rojo' ? v : null);
export const numDe = (v: unknown) => (v == null ? null : Number(v));
export function parsearSubpuntajes(v: unknown): Record<string, Sub> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  return Object.fromEntries(
    Object.entries(v as Record<string, Record<string, unknown>>).map(([k, x]) => [k, { valor: Number(x?.valor), nivel: nivelDe(x?.nivel) }]),
  );
}

export const TEXTO: Record<NivelHoy, string> = { verde: 'text-exito', naranja: 'text-[#ca8a04]', rojo: 'text-error' };
export const BARRA: Record<NivelHoy, string> = { verde: 'bg-exito', naranja: 'bg-[#eab308]', rojo: 'bg-error' };
export const PUNTO: Record<NivelHoy, string> = { verde: 'bg-[#6ee7b7]', naranja: 'bg-[#fde047]', rojo: 'bg-[#fca5a5]' };
/** Chip de color para las celdas de la tabla. */
export const CHIP: Record<NivelHoy, string> = {
  verde: 'bg-[#dcfce7] text-[#166534]',
  naranja: 'bg-[#fef9c3] text-[#854d0e]',
  rojo: 'bg-[#fee2e2] text-[#991b1b]',
};
export const texto = (n: NivelHoy | null) => (n ? TEXTO[n] : 'text-tinta');

export const MEDALLA = [
  'bg-gradient-to-b from-[#fde68a] to-[#eab308] text-[#422006]',
  'bg-gradient-to-b from-[#f1f5f9] to-[#94a3b8] text-[#0f172a]',
  'bg-gradient-to-b from-[#fdba74] to-[#c2410c] text-white',
];

export const iniciales = (n: string) =>
  n
    .split(/[ ,]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
export const nombreCorto = (n: string) => {
  const [ap, no] = n.split(',').map((x) => x.trim());
  return no ? `${no} ${ap}` : n;
};

export interface Puesto {
  posicion: number | null;
  posicionAnterior: number | null;
  cambio: number | null;
}

/** ▲ puestos ganados, ▼ perdidos, = igual, «Nuevo» si no estaba en el período anterior. */
export function Cambio({ c }: { c: Puesto }) {
  if (c.posicion === null) return null;
  if (c.posicionAnterior === null) return <span className="rounded bg-[#dbeafe] px-1.5 py-0.5 text-[10px] font-bold text-[#1d4ed8] uppercase">Nuevo</span>;
  if (!c.cambio) return <span className="text-xs font-bold text-tinta-suave">=</span>;
  return c.cambio > 0 ? (
    <span className="inline-flex items-center text-xs font-bold text-exito">
      <ChevronUp className="size-4" />
      {c.cambio}
    </span>
  ) : (
    <span className="inline-flex items-center text-xs font-bold text-error">
      <ChevronDown className="size-4" />
      {Math.abs(c.cambio)}
    </span>
  );
}

export interface EnPodio extends Puesto {
  clave: string | number;
  nombre: string;
  puntaje: number | null;
}

/** 2.º a la izquierda, 1.º al medio (más alto), 3.º a la derecha. Va sobre un fondo oscuro. */
export function Podio({ top }: { top: EnPodio[] }) {
  const orden = [top[1], top[0], top[2]];
  const alto = ['h-20', 'h-28', 'h-14'];
  const puesto = [2, 1, 3];
  return (
    <div className="grid grid-cols-3 items-end gap-3 sm:gap-6">
      {orden.map((c, i) => (
        <div key={puesto[i]} className="flex flex-col items-center">
          {c ? (
            <>
              <div className={cn('mb-2 flex size-14 items-center justify-center rounded-full text-lg font-black shadow-lg ring-4 ring-white/20', MEDALLA[puesto[i]! - 1])}>
                {iniciales(c.nombre)}
              </div>
              <p className="max-w-full truncate text-center text-sm font-bold text-white">{nombreCorto(c.nombre)}</p>
              <p className="text-3xl font-black text-white tabular-nums">{formatearNumero(c.puntaje ?? 0, 0)}</p>
              <div className="mb-2 h-5">
                <Cambio c={c} />
              </div>
            </>
          ) : (
            <div className="h-24" />
          )}
          <div className={cn('flex w-full items-start justify-center rounded-t-lg pt-2 text-2xl font-black', alto[i], MEDALLA[puesto[i]! - 1])}>{puesto[i]}</div>
        </div>
      ))}
    </div>
  );
}

/** Migración 111: el chofer no compite porque su camión no manda datos del motor (lo decide la base). */
export function NoCompite() {
  return (
    <span
      className="inline-block rounded bg-fondo px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap text-tinta-suave uppercase"
      title="Su camión solo manda la posición, sin los datos del motor: hasta tenerlos no compite en el ranking"
    >
      No compite
    </span>
  );
}

/** Insignia del puesto: oro, plata, bronce o oscura. */
export function Insignia({ posicion }: { posicion: number | null }) {
  if (posicion === null) return <span className="text-[11px] text-tinta-suave">s/puesto</span>;
  return (
    <span
      className={cn(
        'inline-flex size-8 items-center justify-center rounded-lg text-sm font-black tabular-nums',
        posicion <= 3 ? MEDALLA[posicion - 1] : 'bg-[#0f172a] text-white',
      )}
    >
      {posicion}
    </span>
  );
}

/** Subpuntuaciones de la marca agrupadas como en Optifleet. Las que no estén acá van a «Otros». */
const GRUPOS: { titulo: string; icono: typeof Gauge; total?: string; partes: Record<string, string> }[] = [
  {
    titulo: 'Anticipación',
    icono: Hand,
    partes: {
      anticipation: 'Anticipación',
      braking: 'Relación frenado/parada',
      anticipationAndBraking: 'Anticipación y frenado',
      coasting: 'En punto muerto',
    },
  },
  {
    titulo: 'Uso óptimo',
    icono: Gauge,
    partes: {
      gearboxInAutoMode: 'Optidriver A (automático)',
      withinEconomy: 'En zona verde',
      engineAndGearUtilization: 'Uso del motor y los cambios',
      engineAndGearUtilisation: 'Uso del motor y los cambios',
      topgear: 'Marcha más alta',
      engineLoad: 'Carga del motor',
      aboveEconomy: 'Sobre la zona económica',
    },
  },
  { titulo: 'Velocidad', icono: Zap, partes: { cruiseControl: 'Programador', speedAdaption: 'Adaptación de la velocidad', speedAdaptation: 'Adaptación de la velocidad' } },
  { titulo: 'Parada', icono: Timer, partes: { idling: 'Ralentí', standstill: 'Tiempo detenido' } },
  {
    titulo: 'Uso abusivo',
    icono: OctagonAlert,
    total: 'abusiveUse',
    partes: { gearboxInPowerMode: 'Optidriver P (potencia)', overrev: 'Motor sobrerrevolucionado', gearboxInManualMode: 'Caja en manual' },
  },
];
const CONOCIDAS = new Set(GRUPOS.flatMap((g) => [...Object.keys(g.partes), ...(g.total ? [g.total] : [])]));

/** Tarjetas oscuras como Optifleet: grupo con su número y cada subpuntuación con su punto de color. */
export function Subpuntuaciones({ subpuntajes }: { subpuntajes: Record<string, Sub> }) {
  const grupos = GRUPOS.map((g) => {
    const filas = Object.entries(g.partes).flatMap(([k, etiqueta]) => (subpuntajes[k] ? [{ k, etiqueta, ...subpuntajes[k] }] : []));
    const total = g.total && subpuntajes[g.total] ? subpuntajes[g.total]! : null;
    const prom = filas.length ? filas.reduce((s, f) => s + f.valor, 0) / filas.length : null;
    return { ...g, filas, cabecera: total ? total.valor : prom, nivelCabecera: total?.nivel ?? null };
  }).filter((g) => g.filas.length > 0 || g.cabecera !== null);
  const otras = Object.entries(subpuntajes).filter(([k]) => !CONOCIDAS.has(k));
  if (grupos.length === 0 && otras.length === 0) {
    return <p className="text-sm text-white/60">Sin datos de la marca en el período (Scania, Mercedes o sin días con su tarjeta).</p>;
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {grupos.map((g) => (
        <div key={g.titulo} className="rounded-lg bg-[#1e293b] p-3">
          <div className="mb-1 flex items-center gap-2">
            <g.icono className="size-5 text-white/60" />
            <span className="flex-1 font-semibold text-white">{g.titulo}</span>
            {g.cabecera !== null && (
              <span
                className={cn(
                  'flex size-10 items-center justify-center rounded-full text-sm font-bold tabular-nums',
                  g.nivelCabecera ? cn(PUNTO[g.nivelCabecera], 'text-[#0f172a]') : 'bg-white/15 text-white',
                )}
              >
                {formatearNumero(g.cabecera, 1)}
              </span>
            )}
          </div>
          {g.filas.map((f) => (
            <div key={f.k} className="flex items-center gap-2 border-t border-white/10 py-1.5 text-sm">
              <span className="flex-1 text-white/85">{f.etiqueta}</span>
              <span className={cn('size-3 rounded-full', f.nivel ? PUNTO[f.nivel] : 'bg-white/30')} />
              <span className="w-9 text-right font-semibold text-white tabular-nums">{formatearNumero(f.valor, 1)}</span>
            </div>
          ))}
        </div>
      ))}
      {otras.length > 0 && (
        <div className="rounded-lg bg-[#1e293b] p-3">
          <p className="mb-1 font-semibold text-white">Otros</p>
          {otras.map(([k, v]) => (
            <div key={k} className="flex items-center gap-2 border-t border-white/10 py-1.5 text-sm">
              <span className="flex-1 text-white/85">{k}</span>
              <span className={cn('size-3 rounded-full', v.nivel ? PUNTO[v.nivel] : 'bg-white/30')} />
              <span className="w-9 text-right font-semibold text-white tabular-nums">{formatearNumero(v.valor, 1)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const PARTES_CALDERON: { codigo: string; nombre: string }[] = [
  { codigo: 'consumo', nombre: 'Consumo vs. objetivo' },
  { codigo: 'ralenti', nombre: 'Ralentí' },
  { codigo: 'programador', nombre: 'Programador' },
  { codigo: 'velocidad', nombre: 'Velocidad' },
  { codigo: 'marca', nombre: 'Puntaje de la marca' },
];

/** Barras de las partes del Puntaje Calderón (% de los puntos de cada parte). */
export function PartesCalderon({ partes }: { partes: Record<string, number> }) {
  return (
    <div className="space-y-2 rounded-lg bg-[#1e293b] p-3">
      {PARTES_CALDERON.map((p) => {
        const v = partes[p.codigo];
        return (
          <div key={p.codigo}>
            <div className="flex justify-between text-xs text-white/80">
              <span>{p.nombre}</span>
              <span className="font-semibold tabular-nums">{v === undefined ? '—' : `${formatearNumero(v, 0)} %`}</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-white/10">
              {v !== undefined && <div className="h-1.5 rounded-full bg-[#38bdf8]" style={{ width: `${Math.max(0, Math.min(100, v))}%` }} />}
            </div>
          </div>
        );
      })}
      <p className="pt-1 text-[11px] text-white/50">100 % = todos los puntos de esa parte en los viajes aprobados.</p>
    </div>
  );
}
