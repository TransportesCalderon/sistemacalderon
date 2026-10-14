import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { requirePermiso } from '@/modules/core/auth/guards';
import { alcanceDe } from '@/modules/core/permissions/resolver';
import { ChoferesLista } from '@/modules/flota/components/choferes/choferes-lista';
import { parsearListaChoferes } from '@/modules/flota/domain/chofer.lista';
import { basesQueries, catalogosFlotaQueries, choferesQueries } from '@/modules/flota/queries/keys';
import { createSupabaseServerClient } from '@/server/supabase/server';
import { getQueryClient } from '@/shared/query/client';

export const metadata: Metadata = { title: 'Choferes' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** P-MAE-03 · Lista de choferes. Precarga en el servidor e hidrata React Query. */
export default async function ChoferesPage({ searchParams }: Props) {
  const ctx = await requirePermiso('flota.choferes:ver');
  // Alcance "propio" (chofer): no ve la lista, va directo a su ficha.
  if (alcanceDe(ctx.permisos, 'flota.choferes:ver') === 'propio') {
    redirect(ctx.identidad.choferId ? `/flota/choferes/${ctx.identidad.choferId}` : '/sin-acceso?motivo=permiso');
  }
  const params = parsearListaChoferes(await searchParams);

  const db = await createSupabaseServerClient();
  const qc = getQueryClient();
  await Promise.all([
    qc.prefetchQuery(choferesQueries.lista(db, params)),
    qc.prefetchQuery(catalogosFlotaQueries.obtener(db)),
    qc.prefetchQuery(basesQueries.obtener(db)),
  ]);

  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <ChoferesLista />
    </HydrationBoundary>
  );
}
