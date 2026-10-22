import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermiso } from '@/modules/core/auth/guards';
import { ReciboImprimible } from '@/modules/liquidacion/components/recibo-imprimible';
import { liquidacionRepository } from '@/modules/liquidacion/repositories/liquidacion.repository';
import { createSupabaseServerClient } from '@/server/supabase/server';

type Props = { params: Promise<{ id: string }> };
export const metadata: Metadata = { title: 'Mi recibo' };

/** Recibo del chofer (solo los suyos, aprobados o pagados: lo filtra la base). */
export default async function Pagina({ params }: Props) {
  await requirePermiso('chofer.mis_liquidaciones:ver');
  const id = Number((await params).id);
  const l = (await liquidacionRepository(await createSupabaseServerClient()).mias()).find((x) => x.id === id);
  if (!l) notFound();
  return <ReciboImprimible l={l} volver="/chofer/liquidaciones" />;
}
