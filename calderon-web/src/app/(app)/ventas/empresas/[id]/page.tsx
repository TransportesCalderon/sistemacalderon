import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermiso } from '@/modules/core/auth/guards';
import { EmpresaFicha } from '@/modules/ventas/components/empresa-ficha';

type Props = { params: Promise<{ id: string }> };
export const metadata: Metadata = { title: 'Empresa' };

/** Ventas › ficha de una empresa (migración 67). */
export default async function Pagina({ params }: Props) {
  await requirePermiso('ventas.empresas:ver');
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  return <EmpresaFicha id={id} />;
}
