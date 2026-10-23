import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermiso } from '@/modules/core/auth/guards';
import { CotizacionImprimible } from '@/modules/ventas/components/cotizacion-imprimible';
import { ventasRepository } from '@/modules/ventas/repositories/ventas.repository';
import { createSupabaseServerClient } from '@/server/supabase/server';

type Props = { params: Promise<{ id: string }> };
export const metadata: Metadata = { title: 'Cotización' };

/** La cotización para el cliente: imprimir o guardar como PDF (sin el menú). */
export default async function Pagina({ params }: Props) {
  await requirePermiso('ventas.cotizaciones:ver');
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const c = await ventasRepository(await createSupabaseServerClient()).cotizacion(id);
  if (!c) notFound();
  return <CotizacionImprimible c={c} />;
}
