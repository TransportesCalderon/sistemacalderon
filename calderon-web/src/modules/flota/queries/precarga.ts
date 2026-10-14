import 'server-only';

import { cache } from 'react';
import { camionesQueries } from './keys';
import { createSupabaseServerClient } from '@/server/supabase/server';
import { getQueryClient } from '@/shared/query/client';
import type { CamionId } from '@/shared/types/dominio';

/** Convierte el segmento [id] de la URL; null si no es un id válido. */
export function idDeRuta(valor: string): CamionId | null {
  return /^[1-9]\d{0,15}$/.test(valor) ? (Number(valor) as CamionId) : null;
}

/**
 * Lee el camión con el cliente del servidor y deja el resultado en un QueryClient para
 * hidratar. Envuelto en React.cache: generateMetadata y la página comparten la lectura.
 */
export const precargarCamion = cache(async (id: CamionId) => {
  const db = await createSupabaseServerClient();
  const qc = getQueryClient();
  const camion = await qc.fetchQuery(camionesQueries.detalle(db, id));
  return { db, qc, camion };
});
