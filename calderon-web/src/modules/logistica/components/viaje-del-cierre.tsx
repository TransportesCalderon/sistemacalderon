'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle, Route } from 'lucide-react';
import { ErrorBase } from '@/modules/combustible/components/comun/ui';
import { useAbrirFicha } from '@/modules/core/fichas/contexto';
import { useCan } from '@/modules/core/permissions/can';
import type { ErrorAccion } from '@/server/actions/result';
import { invalidar } from '@/shared/query/invalidar';
import { crearViajePasado } from '../actions/por-cerrar.actions';

/**
 * Migración 134: abre el viaje del chofer de un viaje terminado para cargarle operaciones y línea
 * (canon y km del chofer). Si no lo tiene, la base lo crea (viajes de antes de los automáticos).
 */
export function CargarEnViajeChofer({ cargaSalidaId, texto = 'Cargar operaciones y línea' }: { cargaSalidaId: number; texto?: string }) {
  const puede = useCan('operacion.tramos:editar');
  const abrirFicha = useAbrirFicha();
  const qc = useQueryClient();
  const crear = useMutation({ mutationFn: crearViajePasado, onSuccess: () => invalidar(qc, 'cierre') });
  const [error, setError] = useState<ErrorAccion | null>(null);
  if (!puede) return null;
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        className="inline-flex items-center gap-1 text-xs font-medium text-marca hover:underline disabled:opacity-60"
        disabled={crear.isPending}
        onClick={async () => {
          setError(null);
          const r = await crear.mutateAsync({ cargaSalidaId });
          if (r.ok) abrirFicha('viaje', r.data);
          else setError(r.error);
        }}
      >
        {crear.isPending ? <LoaderCircle className="size-3.5 animate-spin" /> : <Route className="size-3.5" />} {texto}
      </button>
      <ErrorBase error={error} />
    </span>
  );
}
