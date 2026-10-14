import type { Metadata } from 'next';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { requirePermiso } from '@/modules/core/auth/guards';
import { ClienteForm } from '@/modules/comercial/components/clientes/cliente-form';
import { catalogosComercialQueries, clientesQueries } from '@/modules/comercial/queries/keys';
import { createSupabaseServerClient } from '@/server/supabase/server';
import { getQueryClient } from '@/shared/query/client';

export const metadata: Metadata = { title: 'Nuevo cliente' };

/** P-CLI-01 · Alta de cliente (Operaciones y Finanzas). */
export default async function NuevoClientePage() {
  await requirePermiso('comercial.clientes:editar');

  const db = await createSupabaseServerClient();
  const qc = getQueryClient();
  await Promise.all([qc.prefetchQuery(catalogosComercialQueries.obtener(db)), qc.prefetchQuery(clientesQueries.segmentos(db))]);

  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <ClienteForm modo="alta" />
    </HydrationBoundary>
  );
}
