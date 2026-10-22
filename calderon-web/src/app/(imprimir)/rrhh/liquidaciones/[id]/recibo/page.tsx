import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermiso } from '@/modules/core/auth/guards';
import { ReciboImprimible } from '@/modules/liquidacion/components/recibo-imprimible';
import { liquidacionRepository } from '@/modules/liquidacion/repositories/liquidacion.repository';
import { createSupabaseServerClient } from '@/server/supabase/server';

type Props = { params: Promise<{ id: string }> };
export const metadata: Metadata = { title: 'Recibo de liquidación' };

/** Recibo de la liquidación para imprimir o guardar como PDF (sin el menú). */
export default async function Pagina({ params }: Props) {
  await requirePermiso('liquidacion.liquidaciones:ver');
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const l = await liquidacionRepository(await createSupabaseServerClient()).liquidacion(id);
  if (!l.numero) notFound();
  return <ReciboImprimible l={l} volver="/rrhh/liquidaciones" />;
}
