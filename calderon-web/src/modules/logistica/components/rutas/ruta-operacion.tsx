'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ExternalLink, LoaderCircle, Map as MapaIcono } from 'lucide-react';
import { ErrorBase } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import type { ErrorAccion } from '@/server/actions/result';
import { invalidar } from '@/shared/query/invalidar';
import { elegirRuta } from '../../actions/rutas.actions';
import { linkCompleto } from '../../domain/rutas';
import { useRutaOperacion, useRutas } from '../../queries/hooks';

/** Migración 135: qué ruta recibe el chofer de esta operación (la predeterminada de la línea u otra). */
export function RutaOperacion({ servicioId, lineaId, abierta }: { servicioId: number; lineaId: number | null; abierta: boolean }) {
  const ver = useCan('operacion.rutas:ver');
  const puede = useCan('operacion.rutas:editar');
  const qc = useQueryClient();
  const { data: rutas } = useRutas(lineaId);
  const { data: actual, isPending } = useRutaOperacion(servicioId);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<ErrorAccion | null>(null);
  if (!ver || lineaId === null || isPending) return null;
  const opciones = (rutas ?? []).filter((r) => r.lineaId === lineaId);
  if (opciones.length === 0) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-tinta-suave">
        <MapaIcono className="size-3.5" /> La línea no tiene ruta para el chofer (se carga en Ajustes › Líneas › Rutas).
      </p>
    );
  }
  const link = actual ? linkCompleto(actual.puntos) : null;
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <MapaIcono className="size-4 text-marca" />
        <span className="text-tinta-suave">Ruta del chofer:</span>
        {puede && abierta ? (
          <select
            className="h-8 rounded-md border border-borde bg-panel px-2 text-sm"
            value={actual?.elegida ? String(actual.id) : ''}
            disabled={enviando}
            onChange={async (e) => {
              setError(null);
              setEnviando(true);
              const r = await elegirRuta({ servicioId, rutaId: e.target.value ? Number(e.target.value) : null });
              setEnviando(false);
              if (!r.ok) setError(r.error);
              else await invalidar(qc, 'operacion');
            }}
          >
            <option value="">{`La predeterminada (${opciones.find((r) => r.predeterminada)?.nombre ?? '—'})`}</option>
            {opciones.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </select>
        ) : (
          <span className="font-medium text-tinta">{actual?.nombre ?? '—'}</span>
        )}
        {enviando && <LoaderCircle className="size-4 animate-spin text-tinta-suave" />}
        {link && (
          <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-marca hover:underline">
            <ExternalLink className="size-3.5" /> Ver
          </a>
        )}
      </div>
      <ErrorBase error={error} />
    </div>
  );
}
