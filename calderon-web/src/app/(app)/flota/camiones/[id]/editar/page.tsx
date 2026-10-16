import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { requirePermiso } from '@/modules/core/auth/guards';
import { CamionForm } from '@/modules/flota/components/camiones/camion-form';
import { camionesQueries, catalogosFlotaQueries } from '@/modules/flota/queries/keys';
import { idDeRuta, precargarCamion } from '@/modules/flota/queries/precarga';

export const metadata: Metadata = { title: 'Editar camión' };

type Props = { params: Promise<{ id: string }> };

/** F-MAE-01 · Edición de camión (Operaciones y TI). Incluye la baja operativa. */
export default async function EditarCamionPage({ params }: Props) {
  await requirePermiso('flota.camiones:editar');
  const id = idDeRuta((await params).id);
  if (!id) notFound();

  const { db, qc, camion } = await precargarCamion(id);
  if (!camion) notFound();
  if (camion.eliminadoEn) redirect(`/flota/camiones/${id}`);
  await Promise.all([qc.prefetchQuery(catalogosFlotaQueries.obtener(db)), qc.prefetchQuery(camionesQueries.tanques(db, id))]);

  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <CamionForm modo="edicion" camion={camion} />
    </HydrationBoundary>
  );
}
