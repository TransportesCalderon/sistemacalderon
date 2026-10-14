import type { Metadata } from 'next';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { requirePermiso } from '@/modules/core/auth/guards';
import { CamionForm } from '@/modules/flota/components/camiones/camion-form';
import { catalogosFlotaQueries } from '@/modules/flota/queries/keys';
import { createSupabaseServerClient } from '@/server/supabase/server';
import { getQueryClient } from '@/shared/query/client';

export const metadata: Metadata = { title: 'Nuevo camión' };

/** F-MAE-01 · Alta de camión (Operaciones y TI). */
export default async function NuevoCamionPage() {
  await requirePermiso('flota.camiones:editar');

  const db = await createSupabaseServerClient();
  const qc = getQueryClient();
  await qc.prefetchQuery(catalogosFlotaQueries.obtener(db));

  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <CamionForm modo="alta" />
    </HydrationBoundary>
  );
}
