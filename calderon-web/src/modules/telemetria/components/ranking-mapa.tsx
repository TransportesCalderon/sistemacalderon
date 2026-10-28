'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Trophy } from 'lucide-react';
import { TD, TH } from '@/modules/catalogos/components/comun';
import { cn } from '@/shared/lib/cn';
import { formatearNumero } from '@/shared/lib/numeros';
import type { CamionEnVivo, DetalleMapa, NivelHoy } from '../domain/flota.types';

/** El color lo decide la base (nivel verde, naranja o rojo); acá solo se pinta. */
const TONO: Record<NivelHoy, string> = { verde: 'text-exito', naranja: 'text-[#ea580c]', rojo: 'text-error' };

const ORDENES = [
  { id: 'eco', texto: 'Eco Score' },
  { id: 'programador', texto: '% de programador' },
  { id: 'abusivo', texto: 'Uso abusivo' },
  { id: 'consumo', texto: 'Consumo del mes' },
] as const;
type Orden = (typeof ORDENES)[number]['id'];

interface Fila {
  camionId: number;
  patente: string;
  chofer: string;
  eco: { total: number; escala: number; nivel: NivelHoy | null } | null;
  programador: { pct: number; nivel: NivelHoy | null } | null;
  abusivo: { activo: boolean; puntaje: number | null; escala: number } | null;
  consumo: number | null;
}

/** Ordena con los vacíos al final. */
function ordenar(filas: Fila[], orden: Orden): Fila[] {
  const valor = (f: Fila): number | null => {
    switch (orden) {
      case 'eco':
        return f.eco ? -(f.eco.total / f.eco.escala) : null;
      case 'programador':
        return f.programador ? -f.programador.pct : null;
      case 'abusivo':
        // Primero los que tuvieron uso abusivo, del peor puntaje al mejor
        return f.abusivo && f.abusivo.puntaje !== null ? (f.abusivo.activo ? -1 : 0) + f.abusivo.puntaje / f.abusivo.escala : null;
      case 'consumo':
        return f.consumo;
    }
  };
  return [...filas].sort((a, b) => {
    const x = valor(a);
    const y = valor(b);
    if (x === null && y === null) return a.chofer.localeCompare(b.chofer);
    if (x === null) return 1;
    if (y === null) return -1;
    return x - y;
  });
}

/**
 * Migración 103: ranking de conducción de hoy, desplegable sobre el mapa. Un renglón por chofer (el de cada
 * camión): Eco Score y programador de hoy, uso abusivo de hoy y consumo del mes. Tocar un renglón elige el camión.
 */
export function RankingMapa({
  camiones,
  detalles,
  onSeleccionar,
}: {
  camiones: CamionEnVivo[];
  detalles: DetalleMapa[];
  onSeleccionar: (camionId: number) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [orden, setOrden] = useState<Orden>('eco');
  const filas = useMemo(() => {
    const patente = new Map(camiones.map((c) => [c.camionId, c.patente]));
    const lista: Fila[] = detalles
      .filter((d) => d.chofer && patente.has(d.camionId))
      .map((d) => ({
        camionId: d.camionId,
        patente: patente.get(d.camionId) ?? '',
        chofer: d.chofer ?? '',
        // Solo lo de hoy (si la marca todavía no mandó el de hoy, queda vacío)
        eco: d.hoy?.eco && d.hoy.eco.hoy ? { total: d.hoy.eco.total, escala: d.hoy.eco.escala, nivel: d.hoy.eco.nivel } : null,
        programador: d.hoy?.programadorPct != null ? { pct: d.hoy.programadorPct, nivel: d.hoy.programadorNivel } : null,
        abusivo: d.hoy?.abusivo && d.hoy.abusivo.hoy ? { activo: d.hoy.abusivo.activo, puntaje: d.hoy.abusivo.puntaje, escala: d.hoy.abusivo.escala } : null,
        consumo: d.consumoMes?.l100km ?? null,
      }));
    return ordenar(lista, orden);
  }, [camiones, detalles, orden]);

  return (
    <div className="rounded-lg border border-borde bg-panel">
      <button
        type="button"
        aria-expanded={abierto}
        onClick={() => setAbierto(!abierto)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-tinta hover:bg-hover"
      >
        <Trophy className="size-4 text-marca" /> Ranking de conducción de hoy
        <span className="text-xs font-normal text-tinta-suave">({filas.length} choferes)</span>
        <span className="flex-1" />
        {abierto ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
      </button>
      {abierto && (
        <div className="space-y-2 border-t border-borde p-3">
          <label className="flex items-center gap-2 text-xs text-tinta-suave">
            Ordenar por
            <select value={orden} onChange={(e) => setOrden(e.target.value as Orden)} className="h-8 rounded-md border border-borde bg-panel px-2 text-sm text-tinta">
              {ORDENES.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.texto}
                </option>
              ))}
            </select>
          </label>
          {filas.length === 0 ? (
            <p className="text-sm text-tinta-suave">No hay camiones con chofer en el mapa.</p>
          ) : (
            <div className="max-h-80 overflow-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="sticky top-0 border-b border-borde bg-fondo">
                  <tr>
                    <th className={TH}>#</th>
                    <th className={TH}>Chofer</th>
                    <th className={cn(TH, 'text-right')}>Eco Score</th>
                    <th className={cn(TH, 'text-right')}>Programador</th>
                    <th className={cn(TH, 'text-right')}>Uso abusivo</th>
                    <th className={cn(TH, 'text-right')}>Consumo del mes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borde">
                  {filas.map((f, i) => (
                    <tr key={f.camionId} className="cursor-pointer hover:bg-hover" onClick={() => onSeleccionar(f.camionId)}>
                      <td className={cn(TD, 'text-tinta-suave')}>{i + 1}</td>
                      <td className={TD}>
                        <span className="font-medium text-tinta">{f.chofer}</span>
                        <span className="block font-mono text-xs text-tinta-suave">{f.patente}</span>
                      </td>
                      <td className={cn(TD, 'text-right tabular-nums')}>
                        {f.eco ? (
                          <>
                            <b className={f.eco.nivel ? TONO[f.eco.nivel] : undefined}>{formatearNumero(f.eco.total, 1)}</b>
                            <span className="text-xs text-tinta-suave"> de {f.eco.escala}</span>
                          </>
                        ) : (
                          <span className="text-tinta-suave">—</span>
                        )}
                      </td>
                      <td className={cn(TD, 'text-right tabular-nums')}>
                        {f.programador ? (
                          <b className={f.programador.nivel ? TONO[f.programador.nivel] : undefined}>{formatearNumero(f.programador.pct, 0)} %</b>
                        ) : (
                          <span className="text-tinta-suave">—</span>
                        )}
                      </td>
                      <td className={cn(TD, 'text-right tabular-nums')}>
                        {f.abusivo && f.abusivo.puntaje !== null ? (
                          <b className={f.abusivo.activo ? 'text-error' : 'text-exito'}>
                            {f.abusivo.activo ? 'Sí' : 'No'} <span className="text-xs font-normal">({formatearNumero(f.abusivo.puntaje, 1)} de {f.abusivo.escala})</span>
                          </b>
                        ) : (
                          <span className="text-tinta-suave">—</span>
                        )}
                      </td>
                      <td className={cn(TD, 'text-right tabular-nums')}>
                        {f.consumo !== null ? `${formatearNumero(f.consumo, 1)} L/100 km` : <span className="text-tinta-suave">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-tinta-suave">
            Eco Score, programador y uso abusivo son de hoy (la marca manda el Eco Score cada 30 minutos). El consumo es el promedio del mes del chofer. Tocá
            un chofer para verlo en el mapa.
          </p>
        </div>
      )}
    </div>
  );
}
