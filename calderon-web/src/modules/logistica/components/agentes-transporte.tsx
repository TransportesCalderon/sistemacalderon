'use client';

import { useState } from 'react';
import { Check, Pencil, Plus, UserRound, X } from 'lucide-react';
import { Cargando, ErrorBase, ErrorLectura } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import type { ErrorAccion } from '@/server/actions/result';
import { cn } from '@/shared/lib/cn';
import { BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import type { AgenteTransporte } from '../repositories/operaciones.repository';
import { useAgentesTransporte, useGuardarAgente } from '../queries/hooks';

const INPUT = 'h-8 w-full max-w-sm rounded-md border border-borde bg-panel px-2 text-sm outline-none focus:border-marca';

/** Migración 137: agentes de transporte (como en RedLine). Se eligen en la operación. */
export function AgentesTransporte() {
  const puede = useCan('operacion.servicios:editar');
  const { data, isPending, isError, refetch } = useAgentesTransporte(true);
  const [editando, setEditando] = useState<number | 'nuevo' | null>(null);
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-tinta">Agentes de transporte</h2>
          <p className="text-sm text-tinta-suave">Se eligen en la operación (entre el lugar de carga y la aduana).</p>
        </div>
        {puede && editando !== 'nuevo' && (
          <button type="button" className={BOTON_SECUNDARIO} onClick={() => setEditando('nuevo')}>
            <Plus className="size-4" /> Nuevo agente
          </button>
        )}
      </div>
      <div className={cn(TARJETA, 'divide-y divide-borde')}>
        {editando === 'nuevo' && <FilaEditar a={null} onCerrar={() => setEditando(null)} />}
        {isPending ? (
          <Cargando texto="Cargando agentes…" />
        ) : isError ? (
          <ErrorLectura texto="No se pudieron cargar los agentes." onReintentar={() => void refetch()} />
        ) : (
          data.map((a) =>
            editando === a.id ? (
              <FilaEditar key={a.id} a={a} onCerrar={() => setEditando(null)} />
            ) : (
              <div key={a.id} className={cn('flex items-center gap-3 px-3 py-2 text-sm', !a.activo && 'text-tinta-suave')}>
                <UserRound className="size-4 shrink-0 text-tinta-suave" />
                <span className="flex-1">
                  {a.nombre}
                  {!a.activo && ' (inactivo)'}
                  {a.operaciones > 0 && <span className="ml-2 text-xs text-tinta-suave">{a.operaciones} operación(es)</span>}
                </span>
                {puede && (
                  <button type="button" className="inline-flex items-center gap-1 text-xs text-marca hover:underline" onClick={() => setEditando(a.id)}>
                    <Pencil className="size-3.5" /> Editar
                  </button>
                )}
              </div>
            ),
          )
        )}
      </div>
    </section>
  );
}

function FilaEditar({ a, onCerrar }: { a: AgenteTransporte | null; onCerrar: () => void }) {
  const guardar = useGuardarAgente();
  const [nombre, setNombre] = useState(a?.nombre ?? '');
  const [activo, setActivo] = useState(a?.activo ?? true);
  const [error, setError] = useState<ErrorAccion | null>(null);
  const enviar = async () => {
    setError(null);
    const r = await guardar.mutateAsync({ id: a?.id ?? null, version: a?.version ?? null, nombre, activo });
    if (r.ok) onCerrar();
    else setError(r.error);
  };
  return (
    <form
      className="space-y-1 px-3 py-2"
      onSubmit={(e) => {
        e.preventDefault();
        void enviar();
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <input className={INPUT} value={nombre} maxLength={120} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del agente" autoFocus />
        {a && (
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} /> Activo
          </label>
        )}
        <button type="submit" disabled={guardar.isPending} className="inline-flex items-center gap-1 text-sm font-medium text-marca hover:underline">
          <Check className="size-4" /> Guardar
        </button>
        <button type="button" onClick={onCerrar} className="inline-flex items-center gap-1 text-sm text-tinta-suave hover:underline">
          <X className="size-4" /> Cancelar
        </button>
      </div>
      <ErrorBase error={error} />
    </form>
  );
}
