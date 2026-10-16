import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { requirePermiso } from '@/modules/core/auth/guards';
import { MochilaCamion } from '@/modules/combustible/components/mochilas/mochila-camion';
import { idDeRuta } from '@/modules/combustible/domain/comun';
import { combustibleQueries as q } from '@/modules/combustible/queries/keys';
import { createSupabaseServerClient } from '@/server/supabase/server';
import { getQueryClient } from '@/shared/query/client';

export const metadata: Metadata = { title: 'Mochila del camión' };

type Props = { params: Promise<{ camionId: string }> };

/** Uso de mochila, vigencias, puesta en marcha y controles de un camión. */
export default async function MochilaCamionPage({ params }: Props) {
  await requirePermiso('combustible.depositos:ver');
  const camionId = idDeRuta<number>((await params).camionId);
  if (!camionId) notFound();
  const db = await createSupabaseServerClient();
  const qc = getQueryClient();
  await Promise.all([
    qc.prefetchQuery(q.mochilas.camiones(db)),
    qc.prefetchQuery(q.mochilas.usos(db, camionId)),
    qc.prefetchQuery(q.mochilas.historial(db, camionId)),
    qc.prefetchQuery(q.catalogos.choferes(db)),
  ]);
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <MochilaCamion camionId={camionId} />
    </HydrationBoundary>
  );
}
