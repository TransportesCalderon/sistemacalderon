import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { requirePermiso } from '@/modules/core/auth/guards';
import { alcanceDe } from '@/modules/core/permissions/resolver';
import { ChoferFicha } from '@/modules/flota/components/choferes/chofer-ficha';
import { nombreCompleto } from '@/modules/flota/domain/chofer.types';
import { basesQueries, catalogosFlotaQueries } from '@/modules/flota/queries/keys';
import { idChoferDeRuta, precargarChofer } from '@/modules/flota/queries/precarga';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = idChoferDeRuta((await params).id);
  if (!id) return { title: 'Chofer' };
  const { chofer } = await precargarChofer(id);
  return { title: chofer ? nombreCompleto(chofer) : 'Chofer' };
}

/** P-MAE-03 · Ficha del chofer. */
export default async function ChoferPage({ params }: Props) {
  const ctx = await requirePermiso('flota.choferes:ver');
  const id = idChoferDeRuta((await params).id);
  if (!id) notFound();
  if (alcanceDe(ctx.permisos, 'flota.choferes:ver') === 'propio' && ctx.identidad.choferId !== id) {
    redirect('/sin-acceso?motivo=permiso');
  }

  const { db, qc, chofer } = await precargarChofer(id);
  if (!chofer) notFound();
  await Promise.all([qc.prefetchQuery(catalogosFlotaQueries.obtener(db)), qc.prefetchQuery(basesQueries.obtener(db))]);

  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <ChoferFicha id={id} />
    </HydrationBoundary>
  );
}
