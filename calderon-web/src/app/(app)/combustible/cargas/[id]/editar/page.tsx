import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { requirePermiso } from '@/modules/core/auth/guards';
import { CargaForm } from '@/modules/combustible/components/cargas/carga-form';
import { idDeRuta } from '@/modules/combustible/domain/comun';
import { precargarCarga } from '@/modules/combustible/queries/precarga';
import { combustibleQueries as q } from '@/modules/combustible/queries/keys';
import { createSupabaseServerClient } from '@/server/supabase/server';
import type { CargaId } from '@/shared/types/dominio';

export const metadata: Metadata = { title: 'Editar carga' };

type Props = { params: Promise<{ id: string }> };

/** Migración 47: corregir una carga en el lugar (sin eliminarla ni anularla). */
export default async function EditarCargaPage({ params }: Props) {
  await requirePermiso('combustible.cargas:editar');
  const id = idDeRuta<CargaId>((await params).id);
  if (!id) notFound();
  const { qc, carga } = await precargarCarga(id);
  if (!carga) notFound();
  const db = await createSupabaseServerClient();
  await Promise.all([
    qc.prefetchQuery(q.catalogos.camiones(db)),
    qc.prefetchQuery(q.catalogos.estaciones(db)),
    qc.prefetchQuery(q.catalogos.choferes(db)),
    qc.prefetchQuery(q.catalogos.monedas(db)),
  ]);
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <CargaForm camionInicial={carga.camionId} reemplazaId={null} carga={carga} />
    </HydrationBoundary>
  );
}
