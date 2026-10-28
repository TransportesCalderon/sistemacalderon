'use client';

import { CircleAlert, RefreshCw } from 'lucide-react';
import type { ErrorAccion } from '@/server/actions/result';

/**
 * Sprint 0 · T04 (docs/DECISIONES.md, regla 1): la validación vive en la base y la web
 * muestra su mensaje tal cual. Estos dos componentes son el único lugar donde se muestra.
 */

/** Error devuelto por una server action: mensaje de la base sin cambios. */
export function ErrorBase({ error, onRecargar }: { error: ErrorAccion | null; onRecargar?: () => void }) {
  if (!error) return null;
  return (
    <div role="alert" className="flex flex-wrap items-start gap-2 rounded-lg border border-error/30 bg-error-suave p-3 text-sm text-error">
      <CircleAlert className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0 flex-1 whitespace-pre-line">{error.mensaje}</span>
      {error.codigo === 'conflicto_version' && onRecargar && (
        <button type="button" onClick={onRecargar} className="inline-flex items-center gap-1 font-medium underline">
          <RefreshCw className="size-3.5" /> Recargar
        </button>
      )}
    </div>
  );
}

/** Error al leer datos, con reintento. */
export function ErrorLectura({ texto, onReintentar, error }: { texto: string; onReintentar: () => void; error?: unknown }) {
  // El mensaje de la base (o de la API) tal cual, para saber qué pasó
  const detalle = error instanceof Error ? error.message : null;
  return (
    <div className="space-y-3 p-6 text-sm">
      <p className="text-error">{texto}</p>
      {detalle && <p className="text-xs text-tinta-suave">{detalle}</p>}
      <button type="button" onClick={onReintentar} className="text-marca hover:underline">
        Reintentar
      </button>
    </div>
  );
}
