'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

const ANCHO = 288;
const MARGEN = 8;

/**
 * Sprint 6 · GloboCampo: un cuadrito que se abre junto a un botón para pedir el dato que falta
 * (la carga de salida, el odómetro, el motivo) sin salir de la lista. Esc o un clic afuera lo cierra.
 * Se dibuja encima de todo (no lo corta una tabla con scroll) y sigue al botón si la lista se mueve.
 * Los clics adentro no llegan a la fila de atrás.
 */
export function Globo({
  titulo,
  ancla,
  onCerrar,
  children,
  className,
}: {
  titulo: string;
  /** El elemento junto al que se abre. */
  ancla: RefObject<HTMLElement | null>;
  onCerrar: () => void;
  children: ReactNode;
  className?: string;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const ubicar = () => {
      const a = ancla.current?.getBoundingClientRect();
      if (!a) return;
      const alto = caja.current?.offsetHeight ?? 0;
      const left = Math.max(MARGEN, Math.min(a.left, window.innerWidth - ANCHO - MARGEN));
      // Debajo del botón; si no entra, arriba
      const abajo = a.bottom + 4;
      const top = abajo + alto > window.innerHeight - MARGEN && a.top - alto - 4 > MARGEN ? a.top - alto - 4 : abajo;
      setPos({ top, left });
    };
    ubicar();
    // Una vez medido el alto, se vuelve a ubicar
    const t = requestAnimationFrame(ubicar);
    window.addEventListener('scroll', ubicar, true);
    window.addEventListener('resize', ubicar);
    return () => {
      cancelAnimationFrame(t);
      window.removeEventListener('scroll', ubicar, true);
      window.removeEventListener('resize', ubicar);
    };
  }, [ancla]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCerrar();
      }
    };
    const clic = (e: MouseEvent) => {
      const t = e.target as Node;
      if (caja.current?.contains(t) || ancla.current?.contains(t)) return;
      onCerrar();
    };
    document.addEventListener('keydown', tecla, true);
    document.addEventListener('mousedown', clic);
    return () => {
      document.removeEventListener('keydown', tecla, true);
      document.removeEventListener('mousedown', clic);
    };
  }, [onCerrar, ancla]);

  // El primer campo (o el botón principal) queda listo para usar con el teclado, sin mover la lista
  useEffect(() => {
    caja.current?.querySelector<HTMLElement>('input, select, textarea, button[data-principal]')?.focus({ preventScroll: true });
  }, []);

  return createPortal(
    <div
      ref={caja}
      role="dialog"
      aria-label={titulo}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: ANCHO }}
      className={cn(
        'fixed z-[1200] space-y-2 rounded-lg border border-borde bg-panel p-3 text-left text-sm whitespace-normal text-tinta shadow-lg',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold">{titulo}</p>
        <button type="button" aria-label="Cerrar" className="text-tinta-suave hover:text-tinta" onClick={onCerrar}>
          <X className="size-4" />
        </button>
      </div>
      {children}
    </div>,
    document.body,
  );
}

/** Un campo del globo: etiqueta arriba, control abajo. */
export function CampoGlobo({ etiqueta, ayuda, children }: { etiqueta: string; ayuda?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-tinta-suave">{etiqueta}</span>
      {children}
      {ayuda && <span className="block text-xs text-tinta-suave">{ayuda}</span>}
    </label>
  );
}

export const ENTRADA_GLOBO = 'h-8 w-full rounded-md border border-borde bg-panel px-2 text-sm outline-none focus:border-marca';
