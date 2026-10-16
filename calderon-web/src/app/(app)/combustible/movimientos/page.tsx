import type { Metadata } from 'next';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { requirePermiso } from '@/modules/core/auth/guards';
import { MovimientosLista } from '@/modules/combustible/components/movimientos/movimientos-lista';
import { parsearListaMovimientos } from '@/modules/combustible/domain/movimiento.types';
import { combustibleQueries as q } from '@/modules/combustible/queries/keys';
import { createSupabaseServerClient } from '@/server/supabase/server';
import { getQueryClient } from '@/shared/query/client';

export const metadata: Metadata = { title: 'Movimientos del camión' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Combustible > Movimientos del camión (fue.v_movimiento_camion, migración 26). */
export default async function MovimientosPage({ searchParams }: Props) {
  await requirePermiso('combustible.movimientos:ver');
  const params = parsearListaMovimientos(await searchParams);
  const db = await createSupabaseServerClient();
  const qc = getQueryClient();
  await Promise.all([qc.prefetchQuery(q.movimientos.lista(db, params)), qc.prefetchQuery(q.catalogos.camiones(db))]);
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <MovimientosLista />
    </HydrationBoundary>
  );
}
