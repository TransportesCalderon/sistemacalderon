import 'server-only';

import { cache } from 'react';
import { createSupabaseServerClient } from '@/server/supabase/server';
import { getQueryClient } from '@/shared/query/client';
import type { CargaId, CierreViajeId } from '@/shared/types/dominio';
import { combustibleQueries as q } from './keys';

/**
 * Precargas de Server Components (lectura con el cliente del servidor e hidratación de
 * React Query). React.cache: generateMetadata y la página comparten la lectura.
 */
export const precargarCierre = cache(async (id: CierreViajeId) => {
  const db = await createSupabaseServerClient();
  const qc = getQueryClient();
  const cierre = await qc.fetchQuery(q.cierres.detalle(db, id));
  if (cierre) {
    const lecturas: Promise<unknown>[] = [qc.prefetchQuery(q.catalogos.choferes(db)), qc.prefetchQuery(q.catalogos.camiones(db))];
    if (cierre.estado === 'borrador') lecturas.push(qc.prefetchQuery(q.cierres.resultado(db, id)));
    await Promise.all(lecturas);
  }
  return { qc, cierre };
});

export const precargarCarga = cache(async (id: CargaId) => {
  const db = await createSupabaseServerClient();
  const qc = getQueryClient();
  const carga = await qc.fetchQuery(q.cargas.detalle(db, id));
  return { qc, carga };
});
