import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { requirePermiso } from '@/modules/core/auth/guards';
import { CierreFicha } from '@/modules/combustible/components/cierres/cierre-ficha';
import { idDeRuta } from '@/modules/combustible/domain/comun';
import { precargarCierre } from '@/modules/combustible/queries/precarga';
import type { CierreViajeId } from '@/shared/types/dominio';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = idDeRuta<CierreViajeId>((await params).id);
  if (!id) return { title: 'Cierre de viaje' };
  const { cierre } = await precargarCierre(id);
  return { title: cierre ? `Cierre ${cierre.numero}` : 'Cierre de viaje' };
}

/** Ficha del cierre: identificación, tractor, mochila, resultado, verificación y acciones. */
export default async function CierrePage({ params }: Props) {
  await requirePermiso('combustible.cierre_viaje:ver');
  const id = idDeRuta<CierreViajeId>((await params).id);
  if (!id) notFound();
  const { qc, cierre } = await precargarCierre(id);
  if (!cierre) notFound();
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <CierreFicha id={id} />
    </HydrationBoundary>
  );
}
