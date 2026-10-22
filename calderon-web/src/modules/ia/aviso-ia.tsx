'use client';

import { LoaderCircle, Sparkles } from 'lucide-react';
import type { EstadoLector } from './use-lector-ia';

/** Lo que dice la IA mientras lee y después: siempre «revisalo», con los avisos de la base. */
export function AvisoIA({ estado }: { estado: EstadoLector }) {
  if (estado.fase === 'quieto') return null;
  if (estado.fase === 'leyendo')
    return (
      <p className="flex items-center gap-2 rounded-md bg-marca-suave px-3 py-2 text-sm text-marca">
        <LoaderCircle className="size-4 animate-spin" /> La IA está leyendo la foto…
      </p>
    );
  if (estado.fase === 'error') return <p className="rounded-md bg-alerta-suave px-3 py-2 text-sm text-alerta">{estado.mensaje}</p>;
  const { propuesta: p, avisos } = estado;
  return (
    <div className="space-y-1 rounded-md bg-marca-suave px-3 py-2 text-sm text-marca">
      <p className="flex items-center gap-2 font-medium">
        <Sparkles className="size-4" /> La IA completó los datos que pudo leer{p.confianza ? ` (seguridad ${p.confianza})` : ''}. Revisalos antes de guardar.
      </p>
      {p.observacion && <p className="text-tinta">{p.observacion}</p>}
      {avisos.map((a) => (
        <p key={a} className="text-alerta">
          • {a}
        </p>
      ))}
    </div>
  );
}
