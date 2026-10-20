import type { Metadata } from 'next';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { requirePermiso } from '@/modules/core/auth/guards';
import { CierresLista } from '@/modules/combustible/components/cierres/cierres-lista';
import { parsearListaCierres } from '@/modules/combustible/domain/cierre.types';
import { combustibleQueries as q } from '@/modules/combustible/queries/keys';
import { createSupabaseServerClient } from '@/server/supabase/server';
import { getQueryClient } from '@/shared/query/client';
import { Pestanas } from '@/shared/ui/pestanas';
import { PESTANAS_VIAJES } from '@/shared/ui/pestanas-secciones';

export const metadata: Metadata = { title: 'Cierres de viaje' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Combustible > Cierres de viaje (lista). Los cierres se crean desde Viajes. */
export default async function CierresPage({ searchParams }: Props) {
  await requirePermiso('combustible.cierre_viaje:ver');
  const params = parsearListaCierres(await searchParams);
  const db = await createSupabaseServerClient();
  const qc = getQueryClient();
  await Promise.all([qc.prefetchQuery(q.cierres.lista(db, params)), qc.prefetchQuery(q.catalogos.camiones(db))]);
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <Pestanas items={PESTANAS_VIAJES} />
      <CierresLista />
    </HydrationBoundary>
  );
}
