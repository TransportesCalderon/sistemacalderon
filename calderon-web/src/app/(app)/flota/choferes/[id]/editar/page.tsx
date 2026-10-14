import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { requirePermiso } from '@/modules/core/auth/guards';
import { alcanceDe } from '@/modules/core/permissions/resolver';
import { ChoferForm } from '@/modules/flota/components/choferes/chofer-form';
import { basesQueries, catalogosFlotaQueries } from '@/modules/flota/queries/keys';
import { idChoferDeRuta, precargarChofer } from '@/modules/flota/queries/precarga';

export const metadata: Metadata = { title: 'Editar chofer' };

type Props = { params: Promise<{ id: string }> };

/** F-MAE-03 · Edición de chofer. Incluye la baja (estado Baja + fecha de egreso). */
export default async function EditarChoferPage({ params }: Props) {
  const ctx = await requirePermiso('flota.choferes:editar');
  const id = idChoferDeRuta((await params).id);
  if (!id) notFound();
  if (alcanceDe(ctx.permisos, 'flota.choferes:editar') === 'propio' && ctx.identidad.choferId !== id) {
    redirect('/sin-acceso?motivo=permiso');
  }

  const { db, qc, chofer } = await precargarChofer(id);
  if (!chofer) notFound();
  if (chofer.eliminadoEn) redirect(`/flota/choferes/${id}`);
  await Promise.all([qc.prefetchQuery(catalogosFlotaQueries.obtener(db)), qc.prefetchQuery(basesQueries.obtener(db))]);

  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <ChoferForm modo="edicion" chofer={chofer} />
    </HydrationBoundary>
  );
}
