'use client';

import { useQuery } from '@tanstack/react-query';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { browserDb } from '@/shared/supabase/browser';
import { parsearCuentas } from '../domain/cuenta-transferencia';

/** Migración 288 · Las cuentas de un chofer (null = las mías). Migración 303: varias por moneda. */
export function useCuentasTransferencia(choferId: number | null, activo = true) {
  const hay = useBaseTiene(288);
  return useQuery({
    queryKey: ['chofer', 'cuentas-transferencia', choferId ?? 'mias'] as const,
    enabled: hay && activo,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await browserDb().schema('fin').rpc('fn_cuentas_transferencia', { p_chofer: choferId });
      if (error) throw error;
      return parsearCuentas(data);
    },
  });
}
