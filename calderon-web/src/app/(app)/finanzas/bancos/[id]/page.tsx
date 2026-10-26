import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermiso } from '@/modules/core/auth/guards';
import { CartolaPantalla } from '@/modules/finanzas/components/cartola-pantalla';

type Props = { params: Promise<{ id: string }> };
export const metadata: Metadata = { title: 'Cartola' };

/** Finanzas › Bancos y cajas › cartola y conciliación (migración 73). */
export default async function Pagina({ params }: Props) {
  await requirePermiso('finanzas.bancos:ver');
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  return <CartolaPantalla cuentaId={id} />;
}
