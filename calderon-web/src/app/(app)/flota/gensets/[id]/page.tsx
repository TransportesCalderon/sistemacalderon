import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermiso } from '@/modules/core/auth/guards';
import { GensetFicha } from '@/modules/combustible/components/genset/genset-ficha';

export const metadata: Metadata = { title: 'Genset' };

/** Flota > Gensets > ficha: combustible del genset, vueltas y cierres (migración 48). */
export default async function Pagina({ params }: { params: Promise<{ id: string }> }) {
  await requirePermiso('flota.pizarra:ver');
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  return <GensetFicha id={Number(id)} />;
}
