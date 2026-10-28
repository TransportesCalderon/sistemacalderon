'use client';

import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Flag, Trophy } from 'lucide-react';
import { Cargando, ErrorLectura, Vacio } from '@/modules/combustible/components/comun/ui';
import { useSesion } from '@/modules/core/session/session-provider';
import { RepoError } from '@/shared/repository/types';
import { cn } from '@/shared/lib/cn';
import { hoyEnZona } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { browserDb } from '@/shared/supabase/browser';
import { FUENTE_CONSUMO_MES, type NivelHoy } from '../domain/flota.types';
import { BARRA, Cambio, Insignia, PartesCalderon, Podio, Subpuntuaciones, nombreCorto, texto, type Sub } from './campeonato-comun';

type J = Record<string, unknown>;
interface ChoferMes {
  choferId: number | null;
  chofer: string;
  posicion: number | null;
  posicionAnterior: number | null;
  cambio: number | null;
  puntaje: number | null;
  nivel: NivelHoy | null;
  viajes: number;
  km: number | null;
  partes: Record<string, number>;
  consumo: { l100km: number | null; fuente: string | null } | null;
  programadorPct: number | null;
  programadorNivel: NivelHoy | null;
  ralentiPct: number | null;
  ralentiH: number | null;
  ralentiNivel: NivelHoy | null;
  eco10: number | null;
  ecoNivel: NivelHoy | null;
  diasAbusivo: number | null;
  diasConDato: number | null;
  subpuntajes: Record<string, Sub>;
}

const nivel = (v: unknown): NivelHoy | null => (v === 'verde' || v === 'naranja' || v === 'rojo' ? v : null);
const num = (v: unknown) => (v == null ? null : Number(v));

async function leer(mes: string) {
  const { data, error } = await browserDb().schema('fue').rpc('fn_ranking_mensual', { p_mes: mes });
  if (error) throw new RepoError(error);
  const d = (data ?? {}) as J;
  return {
    flota: num(d.flota),
    choferes: (Array.isArray(d.choferes) ? (d.choferes as J[]) : []).map((c): ChoferMes => {
      const k = c.consumo && typeof c.consumo === 'object' ? (c.consumo as J) : null;
      const sub = c.subpuntajes && typeof c.subpuntajes === 'object' ? (c.subpuntajes as Record<string, J>) : {};
      return {
        choferId: num(c.chofer_id),
        chofer: String(c.chofer ?? ''),
        posicion: num(c.posicion),
        posicionAnterior: num(c.posicion_anterior),
        cambio: num(c.cambio),
        puntaje: num(c.puntaje),
        nivel: nivel(c.nivel),
        viajes: Number(c.viajes ?? 0),
        km: num(c.km),
        partes: (c.partes ?? {}) as Record<string, number>,
        consumo: k ? { l100km: num(k.l_100km), fuente: typeof k.fuente === 'string' ? k.fuente : null } : null,
        programadorPct: num(c.programador_pct),
        programadorNivel: nivel(c.programador_nivel),
        ralentiPct: num(c.ralenti_pct),
        ralentiH: num(c.ralenti_h),
        ralentiNivel: nivel(c.ralenti_nivel),
        eco10: num(c.eco_10),
        ecoNivel: nivel(c.eco_nivel),
        diasAbusivo: num(c.dias_abusivo),
        diasConDato: num(c.dias_con_dato_abusivo),
        subpuntajes: Object.fromEntries(Object.entries(sub).map(([key, v]) => [key, { valor: Number(v.valor), nivel: nivel(v.nivel) }])),
      };
    }),
  };
}

const nombreMes = (mes: string) => {
  const [a, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(a ?? 2026, (m ?? 1) - 1, 15)).toLocaleDateString('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};
const moverMes = (mes: string, n: number) => {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(a ?? 2026, (m ?? 1) - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
/** Ficha del chofer: subpuntuaciones del mes como Optifleet y las partes del Puntaje Calderón. */
function Ficha({ c }: { c: ChoferMes }) {
  return (
    <div className="grid gap-4 bg-[#0f172a] p-4 lg:grid-cols-[2fr_1fr]">
      <div>
        <p className="mb-2 text-xs font-semibold tracking-wider text-white/60 uppercase">Subpuntuaciones del mes (marca, 0 a 10)</p>
        <Subpuntuaciones subpuntajes={c.subpuntajes} />
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold tracking-wider text-white/60 uppercase">Puntaje Calderón por parte</p>
        <PartesCalderon partes={c.partes} />
      </div>
    </div>
  );
}

/**
 * Viajes › Ranking de choferes (migraciones 103 y 107): campeonato del mes. Puesto por Puntaje Calderón de los viajes
 * aprobados, con puestos ganados o perdidos contra el mes anterior, y la ficha de cada chofer con todo lo del mes.
 */
export function RankingMensualPantalla() {
  const { zonaHoraria } = useSesion();
  const actual = hoyEnZona(zonaHoraria).slice(0, 7);
  const [mes, setMes] = useState(actual);
  const [abierto, setAbierto] = useState<number | null>(null);
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['telemetria', 'ranking-mensual', mes],
    queryFn: () => leer(`${mes}-01`),
  });
  const conPuesto = (data?.choferes ?? []).filter((c) => c.posicion !== null);
  const sinPuesto = (data?.choferes ?? []).filter((c) => c.posicion === null);
  const todos = [...conPuesto, ...sinPuesto];

  return (
    <div className="space-y-5">
      {/* Cabecera de campeonato */}
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-[#0f172a] via-[#1e3a8a] to-[#0f172a] p-5 text-white shadow-lg sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <Flag className="size-5 text-[#facc15]" />
          <p className="text-xs font-bold tracking-[0.2em] text-white/70 uppercase">Campeonato de conducción</p>
          <span className="flex-1" />
          <div className="flex items-center gap-1">
            <button type="button" aria-label="Mes anterior" className="rounded-md bg-white/10 p-1.5 hover:bg-white/20" onClick={() => setMes(moverMes(mes, -1))}>
              <ChevronLeft className="size-4" />
            </button>
            <input
              type="month"
              aria-label="Mes"
              value={mes}
              max={actual}
              onChange={(e) => e.target.value && setMes(e.target.value)}
              className="h-8 rounded-md border border-white/20 bg-white/10 px-2 text-sm text-white [color-scheme:dark]"
            />
            <button
              type="button"
              aria-label="Mes siguiente"
              disabled={mes >= actual}
              className="rounded-md bg-white/10 p-1.5 hover:bg-white/20 disabled:opacity-30"
              onClick={() => setMes(moverMes(mes, 1))}
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
        <h1 className="mt-2 text-3xl font-black tracking-tight first-letter:uppercase sm:text-4xl">{nombreMes(mes)}</h1>
        <p className="mt-1 text-sm text-white/70">
          {conPuesto.length} {conPuesto.length === 1 ? 'chofer' : 'choferes'} en carrera
          {data?.flota != null && ` · promedio de la flota ${formatearNumero(data.flota, 0)} puntos`}
        </p>
        {conPuesto.length > 0 && (
          <div className="mx-auto mt-6 max-w-2xl">
            <Podio top={conPuesto.slice(0, 3).map((c, i) => ({ ...c, clave: c.choferId ?? i, nombre: c.chofer }))} />
          </div>
        )}
      </section>

      {isPending ? (
        <Cargando texto="Armando el campeonato…" />
      ) : isError ? (
        <ErrorLectura texto={error instanceof Error ? error.message : 'No se pudo armar el ranking.'} onReintentar={() => refetch()} />
      ) : todos.length === 0 ? (
        <Vacio icono={<Trophy className="size-6" />} texto="No hay viajes ni conducción registrada en ese mes." />
      ) : (
        <section className="overflow-hidden rounded-2xl border border-borde bg-panel shadow-sm">
          <div className="flex items-center gap-2 border-b border-borde bg-fondo px-4 py-2.5">
            <Trophy className="size-4 text-marca" />
            <h2 className="font-bold text-tinta">Tabla de posiciones</h2>
            <span className="text-xs text-tinta-suave">· tocá un chofer para ver su ficha del mes</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="text-[11px] tracking-wide text-tinta-suave uppercase">
                <tr className="border-b border-borde">
                  <th className="px-3 py-2 text-left">Pos.</th>
                  <th className="px-2 py-2 text-left">vs. mes ant.</th>
                  <th className="px-3 py-2 text-left">Chofer</th>
                  <th className="w-48 px-3 py-2 text-left">Puntaje</th>
                  <th className="px-3 py-2 text-right">Viajes</th>
                  <th className="px-3 py-2 text-right">Km</th>
                  <th className="px-3 py-2 text-right">L/100 km</th>
                  <th className="px-3 py-2 text-right">Progr.</th>
                  <th className="px-3 py-2 text-right">Ralentí</th>
                  <th className="px-3 py-2 text-right">Eco /10</th>
                  <th className="px-3 py-2 text-right">Abusivo</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {todos.map((c, i) => {
                  const clave = c.choferId ?? -i;
                  const abiertoAqui = abierto === clave;
                  const p = c.posicion;
                  return (
                    <Fragment key={clave}>
                      <tr
                        className={cn('cursor-pointer border-b border-borde hover:bg-hover', p === null && 'opacity-70', abiertoAqui && 'bg-marca-suave/40')}
                        onClick={() => setAbierto(abiertoAqui ? null : clave)}
                      >
                        <td className="px-3 py-2.5">
                          <Insignia posicion={p} />
                        </td>
                        <td className="px-2 py-2.5">
                          <Cambio c={c} />
                        </td>
                        <td className="px-3 py-2.5 font-semibold text-tinta">{nombreCorto(c.chofer)}</td>
                        <td className="px-3 py-2.5">
                          {c.puntaje !== null ? (
                            <div className="flex items-center gap-2">
                              <span className={cn('w-8 text-lg font-black tabular-nums', texto(c.nivel))}>{formatearNumero(c.puntaje, 0)}</span>
                              <div className="h-2 flex-1 rounded-full bg-fondo">
                                <div className={cn('h-2 rounded-full', c.nivel ? BARRA[c.nivel] : 'bg-tinta')} style={{ width: `${Math.max(0, Math.min(100, c.puntaje))}%` }} />
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-tinta-suave">sin viajes con puntaje</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{c.viajes}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{c.km === null ? '—' : formatearNumero(c.km, 0)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums" title={c.consumo?.fuente ? (FUENTE_CONSUMO_MES[c.consumo.fuente] ?? c.consumo.fuente) : undefined}>
                          {c.consumo?.l100km != null ? formatearNumero(c.consumo.l100km, 1) : '—'}
                        </td>
                        <td className={cn('px-3 py-2.5 text-right font-semibold tabular-nums', texto(c.programadorNivel))}>
                          {c.programadorPct === null ? '—' : `${formatearNumero(c.programadorPct, 0)} %`}
                        </td>
                        <td className={cn('px-3 py-2.5 text-right font-semibold tabular-nums', texto(c.ralentiNivel))}>
                          {c.ralentiPct === null ? '—' : `${formatearNumero(c.ralentiPct, 0)} %`}
                        </td>
                        <td className={cn('px-3 py-2.5 text-right font-semibold tabular-nums', texto(c.ecoNivel))}>{c.eco10 === null ? '—' : formatearNumero(c.eco10, 1)}</td>
                        <td className="px-3 py-2.5 text-right">
                          {c.diasConDato ? (
                            <span className={cn('font-semibold', c.diasAbusivo ? 'text-error' : 'text-exito')} title={`de ${c.diasConDato} días con dato`}>
                              {c.diasAbusivo ? `${c.diasAbusivo} ${c.diasAbusivo === 1 ? 'día' : 'días'}` : 'Ninguno'}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-2 py-2.5 text-tinta-suave">{abiertoAqui ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}</td>
                      </tr>
                      {abiertoAqui && (
                        <tr>
                          <td colSpan={12} className="p-0">
                            <Ficha c={c} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="border-t border-borde px-4 py-2.5 text-xs text-tinta-suave">
            Puesto: Puntaje Calderón (0 a 100) de los viajes cerrados y aprobados del mes, ponderado por km. Consumo: medido por el motor o, en los camiones
            sin esos datos, de los cierres de viaje. Eco y subpuntuaciones: los de la marca de los días que manejó cada chofer, ponderados por km.
          </p>
        </section>
      )}
    </div>
  );
}
