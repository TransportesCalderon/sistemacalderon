import type { Metadata } from 'next';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { requirePermiso } from '@/modules/core/auth/guards';
import { CargasLista } from '@/modules/combustible/components/cargas/cargas-lista';
import { parsearListaCargas } from '@/modules/combustible/domain/carga.lista';
import { combustibleQueries as q } from '@/modules/combustible/queries/keys';
import { createSupabaseServerClient } from '@/server/supabase/server';
import { getQueryClient } from '@/shared/query/client';

export const metadata: Metadata = { title: 'Cargas' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Combustible > Cargas. Precarga en el servidor e hidrata React Query. */
export default async function CargasPage({ searchParams }: Props) {
  await requirePermiso('combustible.cargas:ver');
  const params = parsearListaCargas(await searchParams);
  const db = await createSupabaseServerClient();
  const qc = getQueryClient();
  await Promise.all([qc.prefetchQuery(q.cargas.lista(db, params)), qc.prefetchQuery(q.catalogos.camiones(db))]);
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <CargasLista />
    </HydrationBoundary>
  );
}
