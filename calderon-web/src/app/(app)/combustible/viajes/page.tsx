import type { Metadata } from 'next';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { requirePermiso } from '@/modules/core/auth/guards';
import { ViajesLista } from '@/modules/combustible/components/viajes/viajes-lista';
import { parsearListaViajes } from '@/modules/combustible/domain/viaje.types';
import { combustibleQueries as q } from '@/modules/combustible/queries/keys';
import { createSupabaseServerClient } from '@/server/supabase/server';
import { getQueryClient } from '@/shared/query/client';

export const metadata: Metadata = { title: 'Viajes' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Combustible > Viajes (fue.v_viaje). */
export default async function ViajesPage({ searchParams }: Props) {
  await requirePermiso('combustible.cierre_viaje:ver');
  const params = parsearListaViajes(await searchParams);
  const db = await createSupabaseServerClient();
  const qc = getQueryClient();
  await Promise.all([qc.prefetchQuery(q.viajes.lista(db, params)), qc.prefetchQuery(q.catalogos.camiones(db))]);
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <ViajesLista />
    </HydrationBoundary>
  );
}
