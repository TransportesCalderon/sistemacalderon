'use client';

import { useQuery } from '@tanstack/react-query';
import { Trophy } from 'lucide-react';
import { TD, TH } from '@/modules/catalogos/components/comun';
import { Cargando, ErrorLectura } from '@/modules/combustible/components/comun/ui';
import { RepoError } from '@/shared/repository/types';
import { cn } from '@/shared/lib/cn';
import { formatearNumero } from '@/shared/lib/numeros';
import { browserDb } from '@/shared/supabase/browser';

interface FilaRanking {
  choferId: number | null;
  chofer: string;
  viajes: number;
  km: number;
  puntaje: number | null;
  mejor: number | null;
  peor: number | null;
  partes: Record<string, number>;
}

const PARTES: { codigo: string; nombre: string }[] = [
  { codigo: 'consumo', nombre: 'Consumo' },
  { codigo: 'ralenti', nombre: 'Ralentí' },
  { codigo: 'programador', nombre: 'Programador' },
  { codigo: 'velocidad', nombre: 'Velocidad' },
  { codigo: 'marca', nombre: 'Puntaje marca' },
];

type J = Record<string, unknown>;
async function leer(desde: string, hasta: string) {
  const { data, error } = await browserDb().schema('fue').rpc('fn_ranking_calderon', { p_desde: desde, p_hasta: hasta });
  if (error) throw new RepoError(error);
  const d = (data ?? {}) as J;
  return {
    flota: d.flota == null ? null : Number(d.flota),
    choferes: (Array.isArray(d.choferes) ? (d.choferes as J[]) : []).map(
      (c): FilaRanking => ({
        choferId: c.chofer_id == null ? null : Number(c.chofer_id),
        chofer: String(c.chofer ?? ''),
        viajes: Number(c.viajes ?? 0),
        km: Number(c.km ?? 0),
        puntaje: c.puntaje == null ? null : Number(c.puntaje),
        mejor: c.mejor == null ? null : Number(c.mejor),
        peor: c.peor == null ? null : Number(c.peor),
        partes: (c.partes ?? {}) as Record<string, number>,
      }),
    ),
  };
}

/** Color del texto: lo mismo que el acta (verde desde 80, naranja desde 60). */
const tono = (v: number | null | undefined) => (v == null ? 'text-tinta-suave' : v >= 80 ? 'text-exito' : v >= 60 ? 'text-alerta' : 'text-error');

/**
 * Migración 90: Puntaje Calderón por chofer (viajes aprobados del período, ponderado por km). Igual para
 * todas las marcas: consumo contra el objetivo, ralentí, programador, velocidad y el puntaje de la marca.
 */
export function RankingCalderon({ desde, hasta }: { desde: string; hasta: string }) {
  const { data, isPending, isError, error, refetch } = useQuery({ queryKey: ['telemetria', 'ranking-calderon', desde, hasta], queryFn: () => leer(desde, hasta) });
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-tinta">
        <Trophy className="size-5 text-marca" /> Puntaje Calderón
        {data?.flota != null && <span className="text-sm font-normal text-tinta-suave">· flota {formatearNumero(data.flota, 0)}</span>}
      </h2>
      <p className="max-w-3xl text-sm text-tinta-suave">
        Viajes cerrados y aprobados del período. Igual para todas las marcas. Cada columna es el % de los puntos de esa parte (100 = perfecto).
      </p>
      {isPending ? (
        <Cargando texto="Calculando…" />
      ) : isError ? (
        <ErrorLectura texto={error instanceof Error ? error.message : 'No se pudo calcular.'} onReintentar={() => refetch()} />
      ) : data.choferes.length === 0 ? (
        <p className="text-sm text-tinta-suave">No hay viajes aprobados con puntaje en el período.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-borde bg-panel">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b border-borde bg-fondo">
              <tr>
                <th className={TH}>#</th>
                <th className={TH}>Chofer</th>
                <th className={cn(TH, 'text-right')}>Puntaje</th>
                <th className={cn(TH, 'text-right')}>Viajes</th>
                <th className={cn(TH, 'text-right')}>Km</th>
                {PARTES.map((p) => (
                  <th key={p.codigo} className={cn(TH, 'text-right')}>
                    {p.nombre}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {data.choferes.map((c, i) => (
                <tr key={c.choferId ?? `s${i}`}>
                  <td className={cn(TD, 'text-tinta-suave')}>{i + 1}</td>
                  <td className={cn(TD, 'font-medium text-tinta')}>{c.chofer}</td>
                  <td className={cn(TD, 'text-right text-base font-bold tabular-nums', tono(c.puntaje))}>{c.puntaje === null ? '—' : formatearNumero(c.puntaje, 0)}</td>
                  <td className={cn(TD, 'text-right tabular-nums')}>{c.viajes}</td>
                  <td className={cn(TD, 'text-right tabular-nums')}>{formatearNumero(c.km, 0)}</td>
                  {PARTES.map((p) => (
                    <td key={p.codigo} className={cn(TD, 'text-right tabular-nums', tono(c.partes[p.codigo]))}>
                      {c.partes[p.codigo] === undefined ? '—' : formatearNumero(c.partes[p.codigo] ?? 0, 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
