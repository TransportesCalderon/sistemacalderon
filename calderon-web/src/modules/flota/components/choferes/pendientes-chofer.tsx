'use client';

import { CircleAlert } from 'lucide-react';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import type { ChoferId } from '@/shared/types/dominio';
import { VERSION_CHOFER_PENDIENTES, type EstadoChofer } from '../../domain/chofer.types';
import { useChoferPendientes } from '../../queries/hooks';

/**
 * Migración 265 · Aviso de lo que el chofer tiene abierto (tractores asignados, relevos, viajes) cuando
 * está o se lo va a poner de licencia o de baja. Solo informa: la baja la frena la base.
 */
export function PendientesChofer({ id, estado }: { id: ChoferId; estado: EstadoChofer }) {
  const hay = useBaseTiene(VERSION_CHOFER_PENDIENTES);
  const { data } = useChoferPendientes(id, hay && estado !== 'activo');
  if (estado === 'activo' || !data?.hay || !data.texto) return null;
  return (
    <p className="flex items-start gap-2 rounded-lg border border-alerta/30 bg-alerta-suave p-3 text-sm text-alerta sm:col-span-2">
      <CircleAlert className="mt-0.5 size-4 shrink-0" />
      <span>
        {estado === 'baja' ? (
          <>La baja no se puede guardar mientras tenga algo abierto. Este chofer {data.texto}.</>
        ) : (
          <>
            Licencia: este chofer {data.texto}. La licencia no cambia el titular del tractor; mientras no haya un viaje o un relevo, el tractor
            figura sin conductor.
          </>
        )}
      </span>
    </p>
  );
}
