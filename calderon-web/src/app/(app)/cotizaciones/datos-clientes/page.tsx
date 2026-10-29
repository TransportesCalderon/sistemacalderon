import type { Metadata } from 'next';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { requirePermiso } from '@/modules/core/auth/guards';
import { ClientesLista } from '@/modules/comercial/components/clientes/clientes-lista';
import { parsearListaClientes } from '@/modules/comercial/domain/cliente.lista';
import { catalogosComercialQueries, clientesQueries } from '@/modules/comercial/queries/keys';
import { createSupabaseServerClient } from '@/server/supabase/server';
import { getQueryClient } from '@/shared/query/client';
import { Pestanas } from '@/shared/ui/pestanas';
import { PESTANAS_COTIZACIONES } from '@/shared/ui/pestanas-secciones';

export const metadata: Metadata = { title: 'Datos de los clientes' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Cotizaciones › Datos de los clientes (Sprint 7: antes /comercial/clientes). P-CLI-01: precarga en el servidor e hidrata React Query. */
export default async function ClientesPage({ searchParams }: Props) {
  await requirePermiso('comercial.clientes:ver');
  const params = parsearListaClientes(await searchParams);

  const db = await createSupabaseServerClient();
  const qc = getQueryClient();
  await Promise.all([
    qc.prefetchQuery(clientesQueries.lista(db, params)),
    qc.prefetchQuery(catalogosComercialQueries.obtener(db)),
    qc.prefetchQuery(clientesQueries.segmentos(db)),
  ]);

  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <Pestanas items={PESTANAS_COTIZACIONES} />
      <ClientesLista />
    </HydrationBoundary>
  );
}
