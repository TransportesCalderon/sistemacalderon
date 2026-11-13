'use client';

import { useQuery } from '@tanstack/react-query';
import { browserDb } from '@/shared/supabase/browser';

/**
 * ¿Mostrar «Aprobar» / «Cerrar y aprobar»? Desde la 170 lo dice la base (la persona está autorizada por TI);
 * si además preparó ese cierre, la base lo rechaza con su mensaje. Antes, el permiso de la pantalla.
 */
export function usePuedeAprobarCierres(): boolean {
  const { data } = useQuery({
    queryKey: ['cierres', 'puedo-aprobar'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: d, error } = await browserDb().schema('fue').rpc('fn_puedo_aprobar_cierres');
      if (error) throw error;
      return d === true;
    },
  });
  return data === true;
}
