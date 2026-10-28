'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Trophy } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { formatearNumero } from '@/shared/lib/numeros';
import type { CamionEnVivo, DetalleMapa, NivelHoy } from '../domain/flota.types';

/** El color lo decide la base (nivel verde, naranja o rojo); acá solo se pinta. */
const TONO: Record<NivelHoy, string> = { verde: 'text-exito', naranja: 'text-[#ea580c]', rojo: 'text-error' };

const ORDENES = [
  { id: 'eco', texto: 'Calificación (Eco Score)' },
  { id: 'programador', texto: 'Programador' },
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

/** Lo que se ve al lado de cada chofer según el orden elegido. */
function Valor({ f, orden }: { f: Fila; orden: Orden }) {
  const vacio = <span className="text-tinta-suave">—</span>;
  switch (orden) {
    case 'eco':
      return f.eco ? (
        <span className="tabular-nums">
          <b className={f.eco.nivel ? TONO[f.eco.nivel] : undefined}>{formatearNumero(f.eco.total, 1)}</b>
          <span className="text-[11px] text-tinta-suave">/{f.eco.escala}</span>
        </span>
      ) : (
        vacio
      );
    case 'programador':
      return f.programador ? <b className={cn('tabular-nums', f.programador.nivel ? TONO[f.programador.nivel] : undefined)}>{formatearNumero(f.programador.pct, 0)} %</b> : vacio;
    case 'abusivo':
      return f.abusivo && f.abusivo.puntaje !== null ? (
        <b className={f.abusivo.activo ? 'text-error' : 'text-exito'}>{f.abusivo.activo ? 'Sí' : 'No'}</b>
      ) : (
        vacio
      );
    case 'consumo':
      return f.consumo !== null ? <span className="tabular-nums">{formatearNumero(f.consumo, 1)} L/100</span> : vacio;
  }
}

/**
 * Migraciones 103 y 107: botón dentro del mapa (abajo a la izquierda, también en pantalla completa) que despliega
 * la posición de cada chofer en el ranking de HOY, ordenado por calificación (Eco Score del día). Se puede ordenar
 * también por programador, uso abusivo o consumo del mes. Tocar un chofer lleva a su camión.
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
    <div className="absolute bottom-6 left-3 z-[1000] flex flex-col-reverse items-start gap-2">
      <button
        type="button"
        aria-expanded={abierto}
        onClick={() => setAbierto(!abierto)}
        className="inline-flex items-center gap-1.5 rounded-md bg-white/95 px-3 py-1.5 text-sm font-semibold text-tinta shadow hover:bg-white"
      >
        <Trophy className="size-4 text-marca" /> Ranking {abierto ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
      </button>
      {abierto && (
        <div className="w-[300px] max-w-[calc(100vw-1.5rem)] rounded-lg bg-white/95 p-2 shadow-lg">
          <div className="flex items-center justify-between gap-2 px-1 pb-1.5">
            <span className="text-xs font-semibold text-tinta">Hoy</span>
            <select
              aria-label="Ordenar por"
              value={orden}
              onChange={(e) => setOrden(e.target.value as Orden)}
              className="h-7 rounded border border-borde bg-panel px-1 text-xs text-tinta"
            >
              {ORDENES.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.texto}
                </option>
              ))}
            </select>
          </div>
          {filas.length === 0 ? (
            <p className="px-1 py-2 text-xs text-tinta-suave">No hay camiones con chofer en el mapa.</p>
          ) : (
            <ol className="max-h-[50vh] overflow-auto">
              {filas.map((f, i) => (
                <li key={f.camionId}>
                  <button
                    type="button"
                    onClick={() => onSeleccionar(f.camionId)}
                    className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-sm hover:bg-hover"
                  >
                    <span className="w-5 shrink-0 text-right text-xs font-semibold text-tinta-suave tabular-nums">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium text-tinta">{f.chofer.split(',')[0]}</span>
                      <span className="ml-1 font-mono text-[11px] text-tinta-suave">{f.patente}</span>
                    </span>
                    <Valor f={f} orden={orden} />
                  </button>
                </li>
              ))}
            </ol>
          )}
          <p className="px-1 pt-1.5 text-[11px] leading-snug text-tinta-suave">
            Calificación: Eco Score de hoy de la marca. Sin dato de hoy, va al final.
          </p>
        </div>
      )}
    </div>
  );
}
