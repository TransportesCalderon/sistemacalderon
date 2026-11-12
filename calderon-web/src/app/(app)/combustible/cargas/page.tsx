import type { Metadata } from 'next';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { requirePermiso } from '@/modules/core/auth/guards';
import { Pestanas } from '@/shared/ui/pestanas';
import { PESTANAS_CARGAS } from '@/shared/ui/pestanas-secciones';
import { CargasLista } from '@/modules/combustible/components/cargas/cargas-lista';
import { CargasGensetLista } from '@/modules/combustible/components/genset/cargas-genset-lista';
import { OrdenesCarga } from '@/modules/combustible/components/ordenes/ordenes-carga';
import { OrdenesPorRegistrar } from '@/modules/combustible/components/ordenes/ordenes-por-registrar';
import { parsearListaCargas } from '@/modules/combustible/domain/carga.lista';
import { combustibleQueries as q } from '@/modules/combustible/queries/keys';
import { createSupabaseServerClient } from '@/server/supabase/server';
import { getQueryClient } from '@/shared/query/client';

export const metadata: Metadata = { title: 'Cargas' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Combustible > Cargas. Precarga en el servidor e hidrata React Query. */
export default async function CargasPage({ searchParams }: Props) {
  await requirePermiso('combustible.cargas:ver');
  const sp = await searchParams;
  // Migración 234: órdenes de carga con QR, como pestaña de Cargas
  if (sp.vista === 'ordenes')
    return (
      <>
        <Pestanas items={PESTANAS_CARGAS} />
        <OrdenesCarga />
      </>
    );
  // Migración 202: las cargas de genset, en la misma pantalla (Tractores | Gensets)
  if (sp.destino === 'genset')
    return (
      <>
        <Pestanas items={PESTANAS_CARGAS} />
        <CargasGensetLista />
      </>
    );
  const params = parsearListaCargas(sp);
  const db = await createSupabaseServerClient();
  const qc = getQueryClient();
  await Promise.all([qc.prefetchQuery(q.cargas.lista(db, params)), qc.prefetchQuery(q.catalogos.camiones(db))]);
  return (
    <>
      <Pestanas items={PESTANAS_CARGAS} />
      {/* Migración 253: cargas de órdenes terminadas, para dar el OK */}
      <OrdenesPorRegistrar />
      <HydrationBoundary state={dehydrate(qc)}>
        <CargasLista />
      </HydrationBoundary>
    </>
  );
}
