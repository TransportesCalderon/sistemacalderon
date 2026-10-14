import 'server-only';

import { cache } from 'react';
import { clientesQueries } from './keys';
import { createSupabaseServerClient } from '@/server/supabase/server';
import { getQueryClient } from '@/shared/query/client';
import type { ClienteId } from '@/shared/types/dominio';

/** Convierte el segmento [id] de la URL; null si no es un id válido. */
export function idClienteDeRuta(valor: string): ClienteId | null {
  return /^[1-9]\d{0,15}$/.test(valor) ? (Number(valor) as ClienteId) : null;
}

/**
 * Lee el cliente con el cliente Supabase del servidor y deja el resultado en un
 * QueryClient para hidratar. Envuelto en React.cache: generateMetadata y la página
 * comparten la lectura.
 */
export const precargarCliente = cache(async (id: ClienteId) => {
  const db = await createSupabaseServerClient();
  const qc = getQueryClient();
  const cliente = await qc.fetchQuery(clientesQueries.detalle(db, id));
  return { db, qc, cliente };
});
