'use client';

import { useQuery } from '@tanstack/react-query';
import { useCan } from '@/modules/core/permissions/can';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { browserDb } from '@/shared/supabase/browser';

/** Migración 170: aprobación cruzada del cierre de viaje. */
export const VERSION_APROBACION_CRUZADA = 170;

/**
 * ¿Mostrar «Aprobar» / «Cerrar y aprobar»? Desde la 170 lo dice la base (la persona está autorizada por TI);
 * si además preparó ese cierre, la base lo rechaza con su mensaje. Antes, el permiso de la pantalla.
 */
export function usePuedeAprobarCierres(): boolean {
  const hay = useBaseTiene(VERSION_APROBACION_CRUZADA);
  const porRol = useCan('combustible.cierre_viaje:transicionar');
  const { data } = useQuery({
    queryKey: ['cierres', 'puedo-aprobar'],
    enabled: hay,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: d, error } = await browserDb().schema('fue').rpc('fn_puedo_aprobar_cierres');
      if (error) throw error;
      return d === true;
    },
  });
  return hay ? data === true : porRol;
}
