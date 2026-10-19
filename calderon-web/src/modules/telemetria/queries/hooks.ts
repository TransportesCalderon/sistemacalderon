'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { REFRESCO } from '@/shared/query/frescura';
import { browserDb } from '@/shared/supabase/browser';
import { importarTelemetriaAhora } from '../actions/flota.actions';
import { telemetriaQueries as q } from './keys';

export const useFlotaEnVivo = () => useQuery({ ...q.enVivo(browserDb()), refetchInterval: REFRESCO.telemetriaVivo });
export const useVehiculosApi = () => useQuery(q.vehiculosApi(browserDb()));
export const useCorridasApi = (enabled: boolean) =>
  useQuery({ ...q.corridas(browserDb()), enabled, refetchInterval: REFRESCO.telemetriaVivo });

export function useImportarAhora() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: importarTelemetriaAhora,
    onSuccess: () => qc.invalidateQueries({ queryKey: q.todo() }),
  });
}
