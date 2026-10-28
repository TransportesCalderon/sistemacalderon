'use client';

import { useMemo } from 'react';
import { ChevronDown, ChevronUp, Trophy } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { formatearNumero } from '@/shared/lib/numeros';
import type { CamionEnVivo, DetalleMapa, NivelHoy } from '../domain/flota.types';

/** El color lo decide la base (nivel verde, naranja o rojo); acá solo se pinta. */
const TONO: Record<NivelHoy, string> = { verde: 'text-exito', naranja: 'text-[#ca8a04]', rojo: 'text-error' };
const FONDO: Record<NivelHoy, string> = { verde: 'bg-exito', naranja: 'bg-[#eab308]', rojo: 'bg-error' };
const tono = (n: NivelHoy | null | undefined) => (n ? TONO[n] : 'text-tinta');

interface Fila {
  camionId: number;
  patente: string;
  chofer: string;
  compite: boolean;
  puntaje: { total: number; nivel: NivelHoy | null } | null;
  eco: { total: number; escala: number; nivel: NivelHoy | null } | null;
  programador: { pct: number; nivel: NivelHoy | null } | null;
  ralenti: { pct: number; nivel: NivelHoy | null } | null;
  abusivo: { activo: boolean } | null;
  consumo: number | null;
}

/** Puntaje general del día (lo calcula la base); sin puntaje, al final por Eco Score. Los que no compiten (sin datos del motor), al final. */
function ordenar(filas: Fila[]): Fila[] {
  const clave = (f: Fila) => [f.puntaje?.total ?? -1, f.eco ? f.eco.total / f.eco.escala : -1] as const;
  return [...filas].sort((a, b) => {
    const [pa, ea] = clave(a);
    const [pb, eb] = clave(b);
    return Number(b.compite) - Number(a.compite) || pb - pa || eb - ea || a.chofer.localeCompare(b.chofer);
  });
}

const vacio = <span className="text-tinta-suave">—</span>;

/**
 * Migraciones 103 y 107: botón dentro del mapa (abajo a la izquierda, también en pantalla completa) que despliega
 * el ranking de HOY con todas las categorías a la vista, ordenado por el puntaje general del día (Puntaje Calderón
 * de hoy). Tocar un chofer lleva a su camión.
 */
export function RankingMapa({
  camiones,
  detalles,
  onSeleccionar,
  abierto,
  onAlternar,
  debajo = false,
}: {
  camiones: CamionEnVivo[];
  detalles: DetalleMapa[];
  onSeleccionar: (camionId: number) => void;
  abierto: boolean;
  onAlternar: () => void;
  /** Fuera de la pantalla completa va debajo del mapa (flotando tapaba el mapa y la ficha del camión). */
  debajo?: boolean;
}) {
  const filas = useMemo(() => {
    const patente = new Map(camiones.map((c) => [c.camionId, c.patente]));
    return ordenar(
      detalles
        .filter((d) => d.chofer && patente.has(d.camionId))
        .map((d) => ({
          camionId: d.camionId,
          patente: patente.get(d.camionId) ?? '',
          chofer: d.chofer ?? '',
          compite: d.hoy?.compite === true,
          puntaje: d.hoy?.puntaje ?? null,
          // Solo lo de hoy (si la marca todavía no mandó el de hoy, queda vacío)
          eco: d.hoy?.eco && d.hoy.eco.hoy ? { total: d.hoy.eco.total, escala: d.hoy.eco.escala, nivel: d.hoy.eco.nivel } : null,
          programador: d.hoy?.programadorPct != null ? { pct: d.hoy.programadorPct, nivel: d.hoy.programadorNivel } : null,
          ralenti: d.hoy?.ralenti ? { pct: d.hoy.ralenti.pct, nivel: d.hoy.ralenti.nivel } : null,
          abusivo: d.hoy?.abusivo && d.hoy.abusivo.hoy && d.hoy.abusivo.puntaje !== null ? { activo: d.hoy.abusivo.activo } : null,
          consumo: d.consumoMes?.l100km ?? null,
        })),
    );
  }, [camiones, detalles]);

  return (
    <div className={debajo ? 'mt-3 flex flex-col items-start gap-2' : 'absolute bottom-6 left-3 z-[1000] flex flex-col-reverse items-start gap-2'}>
      <button
        type="button"
        aria-expanded={abierto}
        onClick={onAlternar}
        className="inline-flex items-center gap-1.5 rounded-md bg-[#0f172a] px-3 py-1.5 text-sm font-bold text-white shadow-lg hover:bg-[#1e293b]"
      >
        <Trophy className="size-4 text-[#facc15]" /> Ranking de hoy {abierto === debajo ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
      </button>
      {abierto && (
        <div className={debajo ? 'max-w-full overflow-hidden rounded-lg border border-borde bg-white' : 'max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-lg bg-white/95 shadow-xl'}>
          {filas.length === 0 ? (
            <p className="px-3 py-2 text-xs text-tinta-suave">No hay camiones con chofer en el mapa.</p>
          ) : (
            <div className={debajo ? 'overflow-x-auto' : 'max-h-[55vh] overflow-auto'}>
              <table className="text-xs">
                <thead className="sticky top-0 bg-[#0f172a] text-[10px] tracking-wide text-white/80 uppercase">
                  <tr>
                    <th className="px-2 py-1.5 text-left">#</th>
                    <th className="px-2 py-1.5 text-left">Chofer</th>
                    <th className="px-2 py-1.5 text-right" title="Puntaje Calderón de hoy (0 a 100)">
                      Puntaje
                    </th>
                    <th className="px-2 py-1.5 text-right">Eco</th>
                    <th className="px-2 py-1.5 text-right">Progr.</th>
                    <th className="px-2 py-1.5 text-right">Ralentí</th>
                    <th className="px-2 py-1.5 text-center">Abusivo</th>
                    <th className="px-2 py-1.5 text-right" title="Consumo del mes del chofer">
                      L/100 mes
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borde">
                  {filas.map((f, i) => (
                    <tr key={f.camionId} className="cursor-pointer hover:bg-hover" onClick={() => onSeleccionar(f.camionId)}>
                      <td className="px-2 py-1">
                        <span
                          className={cn(
                            'inline-flex size-5 items-center justify-center rounded-full text-[10px] font-bold tabular-nums',
                            f.compite && f.puntaje && i === 0
                              ? 'bg-[#facc15] text-[#422006]'
                              : f.compite && f.puntaje && i === 1
                                ? 'bg-[#cbd5e1] text-[#0f172a]'
                                : f.compite && f.puntaje && i === 2
                                  ? 'bg-[#d97706] text-white'
                                  : 'bg-fondo text-tinta-suave',
                          )}
                        >
                          {f.compite ? i + 1 : '—'}
                        </span>
                      </td>
                      <td className="max-w-[150px] truncate px-2 py-1">
                        <span className="font-semibold text-tinta">{f.chofer.split(',')[0]}</span>
                        <span className="ml-1 font-mono text-[10px] text-tinta-suave">{f.patente}</span>
                        {!f.compite && <span className="ml-1 text-[10px] font-bold text-tinta-suave uppercase">no compite</span>}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {f.puntaje ? (
                          <span className={cn('inline-block min-w-8 rounded px-1.5 py-0.5 text-center font-bold text-white tabular-nums', f.puntaje.nivel ? FONDO[f.puntaje.nivel] : 'bg-tinta')}>
                            {formatearNumero(f.puntaje.total, 0)}
                          </span>
                        ) : (
                          vacio
                        )}
                      </td>
                      <td className={cn('px-2 py-1 text-right font-semibold tabular-nums', tono(f.eco?.nivel))}>{f.eco ? formatearNumero(f.eco.total, 1) : vacio}</td>
                      <td className={cn('px-2 py-1 text-right font-semibold tabular-nums', tono(f.programador?.nivel))}>
                        {f.programador ? `${formatearNumero(f.programador.pct, 0)} %` : vacio}
                      </td>
                      <td className={cn('px-2 py-1 text-right font-semibold tabular-nums', tono(f.ralenti?.nivel))}>{f.ralenti ? `${formatearNumero(f.ralenti.pct, 0)} %` : vacio}</td>
                      <td className="px-2 py-1 text-center font-semibold">
                        {f.abusivo ? <span className={f.abusivo.activo ? 'text-error' : 'text-exito'}>{f.abusivo.activo ? 'Sí' : 'No'}</span> : vacio}
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums">{f.consumo !== null ? formatearNumero(f.consumo, 1) : vacio}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="w-0 min-w-full border-t border-borde px-3 py-1.5 text-[10px] leading-snug text-tinta-suave">
            Puntaje del día (0 a 100): ralentí, programador, velocidad y Eco Score de hoy. Eco: Eco Score de hoy de la marca. El consumo es del mes. «No compite»: el camión no mandó hoy datos del motor.
          </p>
        </div>
      )}
    </div>
  );
}
