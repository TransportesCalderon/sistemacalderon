'use client';

import { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Chip, type Tono } from '@/modules/combustible/components/comun/ui';
import { normalizar } from '@/modules/pizarra/domain/pizarra.filtros';
import { cn } from '@/shared/lib/cn';
import type { Operacion } from '../domain/operacion.types';
import {
  ETIQUETA_SITUACION_TRACTOR,
  ETIQUETA_SITUACION_VIAJE_CHOFER,
  type SituacionTractor,
  type SituacionViajeChofer,
} from '../domain/viaje-chofer.types';
import { useLineas, useOperaciones } from '../queries/hooks';
import { ESTADO_INFO } from '../domain/operacion.types';

const TONO_TRACTOR: Record<SituacionTractor, Tono> = { disponible: 'exito', en_viaje: 'marca', sin_chofer: 'alerta', taller: 'neutro' };
const TONO_VIAJE: Record<SituacionViajeChofer, Tono> = { en_viaje: 'marca', por_cerrar: 'alerta', cerrado: 'exito', anulado: 'neutro' };

export const SituacionTractorChip = ({ s }: { s: SituacionTractor }) => <Chip tono={TONO_TRACTOR[s]}>{ETIQUETA_SITUACION_TRACTOR[s]}</Chip>;
export const SituacionViajeChoferChip = ({ s }: { s: SituacionViajeChofer }) => <Chip tono={TONO_VIAJE[s]}>{ETIQUETA_SITUACION_VIAJE_CHOFER[s]}</Chip>;

export const formatoNumero = (v: number | null, dec = 0) =>
  v === null ? '—' : v.toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
export const formatoImporte = (moneda: string | null, v: number | null) => (v === null ? '—' : `${moneda ?? ''} ${formatoNumero(v, 2)}`.trim());

/** Lo que va a llevar el viaje: operaciones o vueltas vacías (por línea). */
export interface ItemElegido {
  servicioId: number | null;
  lineaId: number | null;
}

/** Operaciones que se pueden sumar a un viaje: no canceladas ni de transportista externo. Primero las del tractor. */
export function useOperacionesParaViaje(camionId: number | null, excluir: readonly number[] = []) {
  const { data, isPending } = useOperaciones(null, null);
  const lista = useMemo(() => {
    const fuera = new Set(excluir);
    return (data ?? [])
      .filter((o) => o.estadoLogistica !== 'cancelado' && o.transportistaId === null && !fuera.has(o.servicioId))
      .sort((a, b) => Number(b.camionId === camionId) - Number(a.camionId === camionId) || b.numero - a.numero);
  }, [data, camionId, excluir]);
  return { operaciones: lista, isPending };
}

/**
 * Selector de lo que lleva el viaje: lista de operaciones con casilla (las asignadas a este tractor
 * arriba y marcadas) y, aparte, «vuelta vacía» por línea.
 */
export function SelectorItems({
  camionId,
  elegidos,
  onCambiar,
  excluir = [],
}: {
  camionId: number | null;
  elegidos: ItemElegido[];
  onCambiar: (v: ItemElegido[]) => void;
  excluir?: readonly number[];
}) {
  const { operaciones, isPending } = useOperacionesParaViaje(camionId, excluir);
  const { data: lineas } = useLineas();
  const [texto, setTexto] = useState('');
  const [vacia, setVacia] = useState('');
  const t = normalizar(texto);
  const visibles = operaciones
    .filter((o) => !t || [String(o.numero), o.cliente, o.linea ?? '', o.contenedor ?? '', o.tractor ?? ''].some((c) => normalizar(c).includes(t)))
    .slice(0, 40);
  const marcada = (id: number) => elegidos.some((e) => e.servicioId === id);
  const alternar = (o: Operacion) =>
    onCambiar(marcada(o.servicioId) ? elegidos.filter((e) => e.servicioId !== o.servicioId) : [...elegidos, { servicioId: o.servicioId, lineaId: null }]);
  const vacias = elegidos.filter((e) => e.servicioId === null);

  return (
    <div className="space-y-3">
      <input
        type="search"
        placeholder="Buscar operación por número, cliente, línea o contenedor"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        className="h-9 w-full rounded-md border border-borde bg-panel px-3 text-sm outline-none focus:border-marca"
      />
      <ul className="max-h-72 divide-y divide-borde overflow-y-auto rounded-lg border border-borde bg-panel">
        {isPending ? (
          <li className="px-3 py-2 text-sm text-tinta-suave">Cargando operaciones…</li>
        ) : visibles.length === 0 ? (
          <li className="px-3 py-2 text-sm text-tinta-suave">No hay operaciones para elegir.</li>
        ) : (
          visibles.map((o) => {
            const propia = camionId !== null && o.camionId === camionId;
            return (
              <li key={o.servicioId}>
                <label className={cn('flex cursor-pointer items-start gap-3 px-3 py-2 text-sm hover:bg-hover', marcada(o.servicioId) && 'bg-marca-suave')}>
                  <input type="checkbox" className="mt-1" checked={marcada(o.servicioId)} onChange={() => alternar(o)} />
                  <span className="min-w-0 flex-1">
                    <span className="font-mono font-semibold">N° {o.numero}</span> · {o.cliente}
                    {o.linea && <span className="text-tinta-suave"> · {o.linea}</span>}
                    {o.contenedor && <span className="font-mono text-tinta-suave"> · {o.contenedor}</span>}
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-tinta-suave">
                      <span className={cn('rounded px-1.5 py-0.5', ESTADO_INFO[o.estadoLogistica].clase)}>{ESTADO_INFO[o.estadoLogistica].etiqueta}</span>
                      {propia ? <span className="font-medium text-marca">Asignada a este tractor</span> : o.tractor && <span>Tractor {o.tractor}</span>}
                      {!o.linea && !marcada(o.servicioId) && <span className="text-alerta">Sin línea</span>}
                    </span>
                  </span>
                </label>
                {!o.linea && marcada(o.servicioId) && (
                  <div className="flex items-center gap-2 px-3 pb-2 pl-9 text-sm">
                    <span className="text-alerta">Esta operación no tiene línea:</span>
                    <select
                      aria-label={`Línea de la operación ${o.numero}`}
                      value={elegidos.find((e) => e.servicioId === o.servicioId)?.lineaId ?? ''}
                      onChange={(e) =>
                        onCambiar(elegidos.map((x) => (x.servicioId === o.servicioId ? { ...x, lineaId: e.target.value ? Number(e.target.value) : null } : x)))
                      }
                      className="h-8 rounded-md border border-borde bg-panel px-2 text-sm"
                    >
                      <option value="">Elegí la línea…</option>
                      {lineas?.filter((l) => l.activa).map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.codigo}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </li>
            );
          })
        )}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-tinta-suave">¿Fue o volvió vacío?</span>
        <select aria-label="Línea de la vuelta vacía" value={vacia} onChange={(e) => setVacia(e.target.value)} className="h-9 rounded-md border border-borde bg-panel px-2 text-sm">
          <option value="">Elegí la línea…</option>
          {lineas?.filter((l) => l.activa).map((l) => (
            <option key={l.id} value={l.id}>
              {l.codigo}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!vacia}
          className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-sm text-marca hover:bg-marca-suave disabled:opacity-50"
          onClick={() => {
            onCambiar([...elegidos, { servicioId: null, lineaId: Number(vacia) }]);
            setVacia('');
          }}
        >
          <Plus className="size-4" /> Agregar vuelta vacía
        </button>
      </div>
      {vacias.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {vacias.map((v, i) => (
            <li key={`${v.lineaId}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-fondo px-2.5 py-1 text-xs">
              Vuelta vacía {lineas?.find((l) => l.id === v.lineaId)?.codigo}
              <button
                type="button"
                aria-label="Quitar"
                className="text-tinta-suave hover:text-error"
                onClick={() => onCambiar(elegidos.filter((e) => e !== v))}
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
