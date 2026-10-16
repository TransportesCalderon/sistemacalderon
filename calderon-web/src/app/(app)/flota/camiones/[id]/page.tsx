import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { requirePermiso } from '@/modules/core/auth/guards';
import { CamionFicha } from '@/modules/flota/components/camiones/camion-ficha';
import { camionesQueries, catalogosFlotaQueries } from '@/modules/flota/queries/keys';
import { idDeRuta, precargarCamion } from '@/modules/flota/queries/precarga';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = idDeRuta((await params).id);
  if (!id) return { title: 'Camión' };
  const { camion } = await precargarCamion(id);
  return { title: camion ? `Camión ${camion.codigoInterno}` : 'Camión' };
}

/** P-MAE-01 · Ficha del camión. */
export default async function CamionPage({ params }: Props) {
  await requirePermiso('flota.camiones:ver');
  const id = idDeRuta((await params).id);
  if (!id) notFound();

  const { db, qc, camion } = await precargarCamion(id);
  if (!camion) notFound();
  await Promise.all([qc.prefetchQuery(catalogosFlotaQueries.obtener(db)), qc.prefetchQuery(camionesQueries.tanques(db, id))]);

  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <CamionFicha id={id} />
    </HydrationBoundary>
  );
}
