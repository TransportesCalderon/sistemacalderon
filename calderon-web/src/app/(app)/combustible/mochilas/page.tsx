import type { Metadata } from 'next';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { requirePermiso } from '@/modules/core/auth/guards';
import { MochilasLista } from '@/modules/combustible/components/mochilas/mochilas-lista';
import { combustibleQueries as q } from '@/modules/combustible/queries/keys';
import { createSupabaseServerClient } from '@/server/supabase/server';
import { getQueryClient } from '@/shared/query/client';

export const metadata: Metadata = { title: 'Mochilas y controles' };

/** Combustible > Mochilas y controles: un renglón por camión. */
export default async function MochilasPage() {
  await requirePermiso('combustible.depositos:ver');
  const db = await createSupabaseServerClient();
  const qc = getQueryClient();
  await qc.prefetchQuery(q.mochilas.camiones(db));
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <MochilasLista />
    </HydrationBoundary>
  );
}
