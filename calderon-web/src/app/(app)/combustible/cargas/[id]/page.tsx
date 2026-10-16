import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { requirePermiso } from '@/modules/core/auth/guards';
import { CargaFicha } from '@/modules/combustible/components/cargas/carga-ficha';
import { idDeRuta } from '@/modules/combustible/domain/comun';
import { precargarCarga } from '@/modules/combustible/queries/precarga';
import type { CargaId } from '@/shared/types/dominio';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = idDeRuta<CargaId>((await params).id);
  return { title: id ? `Carga #${id}` : 'Carga' };
}

/** Ficha de carga: datos, parada, rol en el viaje y anulación. */
export default async function CargaPage({ params }: Props) {
  await requirePermiso('combustible.cargas:ver');
  const id = idDeRuta<CargaId>((await params).id);
  if (!id) notFound();
  const { qc, carga } = await precargarCarga(id);
  if (!carga) notFound();
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <CargaFicha id={id} />
    </HydrationBoundary>
  );
}
