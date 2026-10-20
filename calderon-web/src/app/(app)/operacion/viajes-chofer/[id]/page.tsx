import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermiso } from '@/modules/core/auth/guards';
import { ViajeChoferFicha } from '@/modules/logistica/components/viaje-chofer-ficha';

export const metadata: Metadata = { title: 'Viaje de chofer' };

/** Ficha y cierre del viaje de chofer (migración 46). */
export default async function Pagina({ params }: { params: Promise<{ id: string }> }) {
  await requirePermiso('operacion.tramos:ver');
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  return <ViajeChoferFicha id={Number(id)} />;
}
