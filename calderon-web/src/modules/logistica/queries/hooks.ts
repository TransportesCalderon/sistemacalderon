'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { browserDb } from '@/shared/supabase/browser';
import { usePizarraEnVivo } from '@/modules/pizarra/queries/hooks';
import {
  asignarViaje,
  asignarVueltaVacia,
  cambiarChofer,
  cancelarViaje,
  modificarViaje,
  pasoViaje,
  reprogramarDescarga,
} from '../actions/viajes.actions';
import { logisticaQueries as q } from './keys';

export const useViajesAbiertos = () => useQuery({ ...q.abiertos(browserDb()), refetchInterval: 60_000 });
export const useOpcionesViaje = () => useQuery(q.opciones(browserDb()));

/** El mismo aviso de tiempo real de la Pizarra («cambió la pizarra») refresca también la lista de Logística. */
export const useViajesEnVivo = () => usePizarraEnVivo(['logistica']);

function useEscritura<I, R extends { ok: boolean }>(accion: (input: I) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: accion,
    onSuccess: async (r) => {
      if (!r.ok) return;
      await Promise.all([qc.invalidateQueries({ queryKey: q.todo() }), qc.invalidateQueries({ queryKey: ['pizarra'] })]);
    },
  });
}

export const useAsignarViaje = () => useEscritura(asignarViaje);
export const useAsignarVueltaVacia = () => useEscritura(asignarVueltaVacia);
export const useModificarViaje = () => useEscritura(modificarViaje);
export const useReprogramarDescarga = () => useEscritura(reprogramarDescarga);
export const useCambiarChofer = () => useEscritura(cambiarChofer);
export const useCancelarViaje = () => useEscritura(cancelarViaje);
export const usePasoViaje = () => useEscritura(pasoViaje);
