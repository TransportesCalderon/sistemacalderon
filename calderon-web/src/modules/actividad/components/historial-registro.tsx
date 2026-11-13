'use client';

import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { useSesion } from '@/modules/core/session/session-provider';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { browserDb } from '@/shared/supabase/browser';
import { actividadRepository } from '../actividad';

/**
 * Migración 235 · El historial de un registro (por ejemplo un cierre de viaje): cada paso con día, hora y quién.
 */
export function HistorialRegistro({ tabla, id }: { tabla: string; id: number }) {
  const { zonaHoraria } = useSesion();
  const { data } = useQuery({
    queryKey: ['pendientes', 'actividad', tabla, id] as const,
    queryFn: () => actividadRepository(browserDb()).lista({ tabla, fila: id }),
  });
  if (!data || data.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-tinta-suave uppercase">
        <History className="size-3.5" /> Historial
      </p>
      <ol className="space-y-1 text-sm">
        {[...data].reverse().map((a) => (
          <li key={a.id} className="flex flex-wrap gap-x-2">
            <span className="tabular-nums text-tinta-suave">{formatearFechaHora(a.en, zonaHoraria)}</span>
            <span className="font-medium text-tinta">{a.que}</span>
            <span className="text-tinta-suave">· {a.usuario ?? '—'}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
