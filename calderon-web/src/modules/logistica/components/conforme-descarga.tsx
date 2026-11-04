'use client';

import { useState } from 'react';
import type { ErrorAccion } from '@/server/actions/result';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import type { FechaISO } from '@/shared/types/dominio';
import { useMarcarConforme } from '../queries/hooks';

/**
 * Migración 176 · La tilde de «llegó el conforme de descarga». Se ve y se cambia en la ficha de la
 * operación y en Facturación (Por facturar). Quién puede, lo decide la base (Operaciones, Finanzas o TI).
 */
export function ConformeDescarga({
  servicioId,
  conformeEn,
  conformePor,
  zona,
  compacto = false,
}: {
  servicioId: number;
  conformeEn: FechaISO | null;
  conformePor?: string | null;
  zona: string;
  compacto?: boolean;
}) {
  const marcar = useMarcarConforme();
  const [error, setError] = useState<ErrorAccion | null>(null);
  const llego = conformeEn !== null;
  const cambiar = async (v: boolean) => {
    setError(null);
    const r = await marcar.mutateAsync({ servicioId, llego: v });
    if (!r.ok) setError(r.error);
  };
  return (
    <span className={cn('inline-flex flex-col', compacto ? 'items-center' : '')}>
      <label className={cn('inline-flex items-center gap-2', compacto ? 'text-xs' : 'text-sm')} title={llego ? 'Llegó el conforme de descarga' : 'Falta el conforme de descarga'}>
        <input
          type="checkbox"
          className="size-4 accent-marca"
          checked={llego}
          disabled={marcar.isPending}
          onChange={(e) => void cambiar(e.target.checked)}
          aria-label="Llegó el conforme de descarga"
        />
        {!compacto && <span className="text-tinta">Llegó el conforme de descarga</span>}
      </label>
      {!compacto && llego && (
        <span className="text-xs text-tinta-suave">
          {formatearFechaHora(conformeEn, zona)}
          {conformePor && ` · ${conformePor}`}
        </span>
      )}
      {error && <span className="text-xs text-error">{error.mensaje}</span>}
    </span>
  );
}
