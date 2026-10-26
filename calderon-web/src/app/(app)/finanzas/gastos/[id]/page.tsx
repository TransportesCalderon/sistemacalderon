import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermiso } from '@/modules/core/auth/guards';
import { GastoFicha } from '@/modules/finanzas/components/gasto-ficha';

type Props = { params: Promise<{ id: string }> };
export const metadata: Metadata = { title: 'Gasto' };

/** Finanzas › Gastos › ficha (migración 73). */
export default async function Pagina({ params }: Props) {
  await requirePermiso('finanzas.gastos:ver');
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  return <GastoFicha id={id} />;
}
