import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermiso } from '@/modules/core/auth/guards';
import { CotizacionEditor } from '@/modules/ventas/components/cotizacion-editor';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ empresa?: string }> };
export const metadata: Metadata = { title: 'Cotización' };

/** Una cotización (Sprint 7: antes /ventas/cotizaciones/[id]): «nueva» o el número interno (migración 67). */
export default async function Pagina({ params, searchParams }: Props) {
  const { id } = await params;
  if (id === 'nueva') {
    await requirePermiso('ventas.cotizaciones:editar');
    const empresa = Number((await searchParams).empresa) || null;
    return <CotizacionEditor id={null} empresaInicial={empresa} />;
  }
  await requirePermiso('ventas.cotizaciones:ver');
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) notFound();
  return <CotizacionEditor id={n} empresaInicial={null} />;
}
