'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

/**
 * Regla de todo el sistema (DECISIONES, 25/11/2026): al tocar un renglón de una lista, lo que hay para hacer
 * con ese renglón se abre justo debajo de él (no al final de la página ni arriba de la lista).
 * Un solo renglón abierto a la vez; tocarlo de nuevo lo cierra. Funciona también con Enter o espacio.
 *
 * Uso:
 *   const fila = useFilaAbierta<number>();
 *   <FilaDesplegable abierta={fila.es(x.id)} onAlternar={() => fila.alternar(x.id)} columnas={6} detalle={<Ficha … />}>
 *     <td>…</td>
 *   </FilaDesplegable>
 */
export function FilaDesplegable({
  abierta,
  onAlternar,
  columnas,
  detalle,
  className,
  children,
}: {
  abierta: boolean;
  onAlternar: () => void;
  /** Cuántas columnas tiene la tabla (el detalle ocupa todo el ancho). */
  columnas: number;
  detalle: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    if (abierta) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [abierta]);
  return (
    <>
      <tr
        ref={ref}
        tabIndex={0}
        aria-expanded={abierta}
        className={cn('cursor-pointer hover:bg-hover focus-visible:outline-2 focus-visible:outline-marca', abierta && 'bg-marca-suave/40', className)}
        onClick={onAlternar}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onAlternar();
          }
        }}
      >
        {children}
      </tr>
      {abierta && (
        <tr className="bg-fondo/40">
          <td colSpan={columnas} className="border-l-4 border-marca p-2 sm:p-3">
            {detalle}
          </td>
        </tr>
      )}
    </>
  );
}

/** Flechita para la primera o la última columna: muestra si el renglón está abierto. */
export function FlechaFila({ abierta }: { abierta: boolean }) {
  return <ChevronDown className={cn('size-4 shrink-0 text-tinta-suave transition-transform', abierta && 'rotate-180')} aria-hidden />;
}

/** Qué renglón está abierto (uno solo a la vez). */
export function useFilaAbierta<T extends string | number>(inicial: T | null = null) {
  const [abierta, setAbierta] = useState<T | null>(inicial);
  return {
    abierta,
    es: (id: T) => abierta === id,
    alternar: (id: T) => setAbierta((a) => (a === id ? null : id)),
    abrir: (id: T | null) => setAbierta(id),
    cerrar: () => setAbierta(null),
  };
}
