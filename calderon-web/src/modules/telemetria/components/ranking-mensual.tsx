'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Medal, Trophy } from 'lucide-react';
import { TD, TH } from '@/modules/catalogos/components/comun';
import { Cargando, Encabezado, ErrorLectura, Vacio } from '@/modules/combustible/components/comun/ui';
import { useSesion } from '@/modules/core/session/session-provider';
import { RepoError } from '@/shared/repository/types';
import { cn } from '@/shared/lib/cn';
import { hoyEnZona } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { browserDb } from '@/shared/supabase/browser';
import { TARJETA } from '@/shared/ui/clases';
import { FUENTE_CONSUMO_MES, type NivelHoy } from '../domain/flota.types';

type J = Record<string, unknown>;
interface ChoferMes {
  choferId: number | null;
  chofer: string;
  posicion: number | null;
  puntaje: number | null;
  nivel: NivelHoy | null;
  viajes: number;
  km: number | null;
  consumo: { l100km: number | null; fuente: string | null } | null;
  programadorPct: number | null;
  programadorNivel: NivelHoy | null;
  ecoPct: number | null;
  ecoNivel: NivelHoy | null;
  diasAbusivo: number | null;
  diasConDato: number | null;
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
      return {
        choferId: num(c.chofer_id),
        chofer: String(c.chofer ?? ''),
        posicion: num(c.posicion),
        puntaje: num(c.puntaje),
        nivel: nivel(c.nivel),
        viajes: Number(c.viajes ?? 0),
        km: num(c.km),
        consumo: k ? { l100km: num(k.l_100km), fuente: typeof k.fuente === 'string' ? k.fuente : null } : null,
        programadorPct: num(c.programador_pct),
        programadorNivel: nivel(c.programador_nivel),
        ecoPct: num(c.eco_pct),
        ecoNivel: nivel(c.eco_nivel),
        diasAbusivo: num(c.dias_abusivo),
        diasConDato: num(c.dias_con_dato_abusivo),
      };
    }),
  };
}

/** El color lo decide la base (verde, naranja o rojo). */
const TONO: Record<NivelHoy, string> = { verde: 'text-exito', naranja: 'text-[#ea580c]', rojo: 'text-error' };
const tono = (n: NivelHoy | null) => (n ? TONO[n] : 'text-tinta');
const MEDALLA = ['text-[#d4a017]', 'text-[#9aa4b2]', 'text-[#b4703a]'];

const nombreMes = (mes: string) => {
  const [a, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(a ?? 2026, (m ?? 1) - 1, 15)).toLocaleDateString('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};
const moverMes = (mes: string, n: number) => {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(a ?? 2026, (m ?? 1) - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/**
 * Viajes › Ranking de choferes (migración 103): los mejores choferes de cada mes por Puntaje Calderón (viajes
 * aprobados, ponderado por km), con el consumo del mes, el programador, el Eco Score de la marca y el uso abusivo.
 */
export function RankingMensualPantalla() {
  const { zonaHoraria } = useSesion();
  const actual = hoyEnZona(zonaHoraria).slice(0, 7);
  const [mes, setMes] = useState(actual);
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['telemetria', 'ranking-mensual', mes],
    queryFn: () => leer(`${mes}-01`),
  });
  const conPuesto = (data?.choferes ?? []).filter((c) => c.posicion !== null);
  const sinPuesto = (data?.choferes ?? []).filter((c) => c.posicion === null);

  return (
    <div className="space-y-4">
      <Encabezado titulo="Ranking de choferes" subtitulo="Viajes" />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-label="Mes anterior" className="rounded-md border border-borde p-1.5 hover:bg-hover" onClick={() => setMes(moverMes(mes, -1))}>
          <ChevronLeft className="size-4" />
        </button>
        <input
          type="month"
          aria-label="Mes"
          value={mes}
          max={actual}
          onChange={(e) => e.target.value && setMes(e.target.value)}
          className="h-9 rounded-md border border-borde bg-panel px-2 text-sm"
        />
        <button
          type="button"
          aria-label="Mes siguiente"
          disabled={mes >= actual}
          className="rounded-md border border-borde p-1.5 hover:bg-hover disabled:opacity-40"
          onClick={() => setMes(moverMes(mes, 1))}
        >
          <ChevronRight className="size-4" />
        </button>
        <span className="text-sm font-medium text-tinta first-letter:uppercase">{nombreMes(mes)}</span>
        {data?.flota != null && <span className="text-sm text-tinta-suave">· promedio de la flota {formatearNumero(data.flota, 0)} puntos</span>}
      </div>
      <p className="max-w-3xl text-sm text-tinta-suave">
        El puesto sale del Puntaje Calderón (0 a 100) de los viajes cerrados y aprobados del mes, ponderado por km: consumo contra el objetivo, ralentí,
        programador, velocidad y el puntaje de la marca. Igual para todas las marcas.
      </p>

      {isPending ? (
        <Cargando texto="Armando el ranking…" />
      ) : isError ? (
        <ErrorLectura texto={error instanceof Error ? error.message : 'No se pudo armar el ranking.'} onReintentar={() => refetch()} />
      ) : data.choferes.length === 0 ? (
        <Vacio icono={<Trophy className="size-6" />} texto="No hay viajes ni conducción registrada en ese mes." />
      ) : (
        <>
          {conPuesto.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-3">
              {conPuesto.slice(0, 3).map((c, i) => (
                <div key={c.choferId ?? i} className={cn(TARJETA, 'flex items-center gap-3 p-4')}>
                  <Medal className={cn('size-9 shrink-0', MEDALLA[i])} />
                  <div className="min-w-0">
                    <p className="text-xs text-tinta-suave">{i + 1}.º puesto</p>
                    <p className="truncate font-semibold text-tinta">{c.chofer}</p>
                    <p className="text-sm text-tinta-suave">
                      <b className={cn('text-lg', tono(c.nivel))}>{formatearNumero(c.puntaje ?? 0, 0)}</b> puntos · {c.viajes} {c.viajes === 1 ? 'viaje' : 'viajes'}
                      {c.consumo?.l100km != null && ` · ${formatearNumero(c.consumo.l100km, 1)} L/100`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-borde bg-panel">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b border-borde bg-fondo">
                <tr>
                  <th className={TH}>Puesto</th>
                  <th className={TH}>Chofer</th>
                  <th className={cn(TH, 'text-right')}>Puntaje</th>
                  <th className={cn(TH, 'text-right')}>Viajes</th>
                  <th className={cn(TH, 'text-right')}>Km</th>
                  <th className={cn(TH, 'text-right')}>Consumo del mes</th>
                  <th className={cn(TH, 'text-right')}>Programador</th>
                  <th className={cn(TH, 'text-right')}>Eco Score</th>
                  <th className={cn(TH, 'text-right')}>Uso abusivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {[...conPuesto, ...sinPuesto].map((c, i) => (
                  <tr key={c.choferId ?? `s${i}`} className={c.posicion === null ? 'bg-fondo/50' : undefined}>
                    <td className={cn(TD, 'tabular-nums')}>
                      {c.posicion !== null ? <b>{c.posicion}</b> : <span className="text-xs text-tinta-suave">sin viajes con puntaje</span>}
                    </td>
                    <td className={cn(TD, 'font-medium text-tinta')}>{c.chofer}</td>
                    <td className={cn(TD, 'text-right text-base font-bold tabular-nums', tono(c.nivel))}>{c.puntaje === null ? '—' : formatearNumero(c.puntaje, 0)}</td>
                    <td className={cn(TD, 'text-right tabular-nums')}>{c.viajes}</td>
                    <td className={cn(TD, 'text-right tabular-nums')}>{c.km === null ? '—' : formatearNumero(c.km, 0)}</td>
                    <td className={cn(TD, 'text-right tabular-nums')}>
                      {c.consumo?.l100km != null ? (
                        <>
                          {formatearNumero(c.consumo.l100km, 1)} L/100 km
                          {c.consumo.fuente && <span className="block text-xs text-tinta-suave">{FUENTE_CONSUMO_MES[c.consumo.fuente] ?? c.consumo.fuente}</span>}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className={cn(TD, 'text-right font-medium tabular-nums', tono(c.programadorNivel))}>
                      {c.programadorPct === null ? '—' : `${formatearNumero(c.programadorPct, 0)} %`}
                    </td>
                    <td className={cn(TD, 'text-right font-medium tabular-nums', tono(c.ecoNivel))}>{c.ecoPct === null ? '—' : `${formatearNumero(c.ecoPct, 0)} %`}</td>
                    <td className={cn(TD, 'text-right tabular-nums')}>
                      {c.diasConDato ? (
                        <span className={c.diasAbusivo ? 'font-medium text-error' : 'text-exito'}>
                          {c.diasAbusivo ? `${c.diasAbusivo} ${c.diasAbusivo === 1 ? 'día' : 'días'}` : 'Ninguno'}
                          <span className="block text-xs text-tinta-suave">de {c.diasConDato} con dato</span>
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-tinta-suave">
            Consumo: medido por el motor (Renault, Volvo y equipos con lector) o, en los camiones sin esos datos, de los cierres de viaje aprobados. Eco Score: el
            de la marca, en % de su escala. Uso abusivo: días en que la marca lo marcó.
          </p>
        </>
      )}
    </div>
  );
}
