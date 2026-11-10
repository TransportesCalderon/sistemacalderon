'use client';

import { CheckCircle2, Info, TriangleAlert } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import type { Interpretacion } from '../domain/tablero.types';

/** Migración 224: lo que se concluye de la foto del tablero (contra la telemetría, el viaje y lo cargado). */
export function ConclusionesTablero({ i }: { i: Interpretacion }) {
  if (i.conclusiones.length === 0) return null;
  return (
    <ul className="space-y-1 text-left text-sm">
      {i.conclusiones.map((c, k) => (
        <li
          key={k}
          className={cn(
            'flex gap-1.5 rounded-md px-2 py-1',
            c.tono === 'ok' ? 'text-exito' : c.tono === 'alerta' ? 'bg-alerta-suave text-alerta' : 'text-tinta-suave',
          )}
        >
          {c.tono === 'ok' ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          ) : c.tono === 'alerta' ? (
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          ) : (
            <Info className="mt-0.5 size-4 shrink-0" />
          )}
          <span className={c.tono === 'ok' ? 'text-tinta' : undefined}>{c.texto}</span>
        </li>
      ))}
    </ul>
  );
}
