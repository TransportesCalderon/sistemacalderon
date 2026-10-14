import 'server-only';

import { cache } from 'react';
import { camionesQueries, choferesQueries } from './keys';
import { createSupabaseServerClient } from '@/server/supabase/server';
import { getQueryClient } from '@/shared/query/client';
import type { CamionId, ChoferId } from '@/shared/types/dominio';

/** Convierte el segmento [id] de la URL; null si no es un id válido. */
export function idDeRuta(valor: string): CamionId | null {
  return /^[1-9]\d{0,15}$/.test(valor) ? (Number(valor) as CamionId) : null;
}

/** Igual que idDeRuta, para choferes. */
export function idChoferDeRuta(valor: string): ChoferId | null {
  return /^[1-9]\d{0,15}$/.test(valor) ? (Number(valor) as ChoferId) : null;
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

/** Ídem para el chofer (sin documento). */
export const precargarChofer = cache(async (id: ChoferId) => {
  const db = await createSupabaseServerClient();
  const qc = getQueryClient();
  const chofer = await qc.fetchQuery(choferesQueries.detalle(db, id));
  return { db, qc, chofer };
});
