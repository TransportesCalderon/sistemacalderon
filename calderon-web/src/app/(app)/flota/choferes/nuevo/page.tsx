import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { requirePermiso } from '@/modules/core/auth/guards';
import { alcanceDe } from '@/modules/core/permissions/resolver';
import { ChoferForm } from '@/modules/flota/components/choferes/chofer-form';
import { basesQueries, catalogosFlotaQueries } from '@/modules/flota/queries/keys';
import { createSupabaseServerClient } from '@/server/supabase/server';
import { getQueryClient } from '@/shared/query/client';

export const metadata: Metadata = { title: 'Nuevo chofer' };

/** F-MAE-03 · Alta de chofer (Operaciones, RR. HH. y TI). */
export default async function NuevoChoferPage() {
  const ctx = await requirePermiso('flota.choferes:editar');
  if (alcanceDe(ctx.permisos, 'flota.choferes:editar') !== 'todo') redirect('/sin-acceso?motivo=permiso');

  const db = await createSupabaseServerClient();
  const qc = getQueryClient();
  await Promise.all([qc.prefetchQuery(catalogosFlotaQueries.obtener(db)), qc.prefetchQuery(basesQueries.obtener(db))]);

  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <ChoferForm modo="alta" />
    </HydrationBoundary>
  );
}
