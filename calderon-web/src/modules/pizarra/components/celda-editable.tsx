'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LoaderCircle, Pencil } from 'lucide-react';
import type { ErrorAccion } from '@/server/actions/result';
import { cn } from '@/shared/lib/cn';

export interface OpcionCelda {
  id: number;
  nombre: string;
  /** Motivo por el que no conviene elegirla (taller, ya está en otro semi…); la base igual lo controla. */
  noDisponible?: string;
}

/**
 * Sprint 5: una celda de la Pizarra que se cambia ahí mismo. Muestra el valor; con un clic
 * aparece la lista, al elegir se guarda con la acción de siempre y, si la base no lo
 * permite, se muestra su mensaje tal cual debajo. Esc o salir de la lista cancela.
 * El clic no abre ni cierra la fila (la fila tiene su propio clic para el detalle).
 */
export function CeldaEditable({
  texto,
  valor,
  opciones,
  editable,
  etiqueta,
  vacio,
  onElegir,
  className,
  children,
}: {
  /** Lo que se ve cuando no se está editando. */
  texto: ReactNode;
  valor: number | null;
  opciones: readonly OpcionCelda[] | undefined;
  editable: boolean;
  /** Para lectores de pantalla: «Tractor de la unidad AB123CD». */
  etiqueta: string;
  /** Si se puede dejar vacío, el texto de esa opción (por ejemplo «Sin genset»). */
  vacio?: string;
  onElegir: (id: number | null) => Promise<{ ok: boolean; error?: ErrorAccion }>;
  className?: string;
  children?: ReactNode;
}) {
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<ErrorAccion | null>(null);
  const lista = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (editando) lista.current?.focus();
  }, [editando]);

  if (!editable) return <span className={className}>{texto}</span>;

  const elegir = async (v: string) => {
    const id = v === '' ? null : Number(v);
    if (id === valor) return setEditando(false);
    setGuardando(true);
    setError(null);
    try {
      const r = await onElegir(id);
      if (!r.ok && r.error) setError(r.error);
      else setEditando(false);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <span className="block" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      {editando ? (
        <span className="flex items-center gap-1">
          <select
            ref={lista}
            aria-label={etiqueta}
            disabled={guardando}
            defaultValue={valor === null ? '' : String(valor)}
            onChange={(e) => void elegir(e.target.value)}
            onBlur={() => !guardando && setEditando(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                setEditando(false);
                setError(null);
              }
            }}
            className="h-7 max-w-44 rounded border border-marca bg-panel px-1 text-sm"
          >
            <option value="">{vacio ?? 'Elegí…'}</option>
            {opciones?.map((o) => (
              <option key={o.id} value={o.id} disabled={!!o.noDisponible && o.id !== valor}>
                {o.nombre}
                {o.noDisponible ? ` (${o.noDisponible})` : ''}
              </option>
            ))}
          </select>
          {guardando && <LoaderCircle className="size-3.5 animate-spin text-tinta-suave" aria-hidden />}
        </span>
      ) : (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setEditando(true);
          }}
          title={`Cambiar: ${etiqueta}`}
          aria-label={`Cambiar: ${etiqueta}`}
          className={cn('group inline-flex items-center gap-1 rounded px-0.5 text-left hover:bg-marca-suave hover:text-marca', className)}
        >
          {texto}
          {children}
          <Pencil className="size-3 shrink-0 text-tinta-suave opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden />
        </button>
      )}
      {error && (
        // El mensaje de la base, tal cual
        <span role="alert" className="mt-0.5 block max-w-56 whitespace-normal text-xs text-error">
          {error.mensaje}
        </span>
      )}
    </span>
  );
}
