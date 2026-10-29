import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermiso } from '@/modules/core/auth/guards';
import { ActaImprimible } from '@/modules/actas/components/acta-imprimible';
import { actaRepository } from '@/modules/actas/repositories/acta.repository';
import { createSupabaseServerClient } from '@/server/supabase/server';

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: 'Acta de infracción' };

/** Migración 122 · El acta de infracción en una hoja A4, para que la firme el chofer. Fuera del marco de la aplicación. */
export default async function Pagina({ params }: Props) {
  const ctx = await requirePermiso('operacion.actas:ver');
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const db = await createSupabaseServerClient();
  const acta = await actaRepository(db).detalle(id).catch(() => null);
  if (!acta) notFound();
  return <ActaImprimible a={acta} zonaHoraria={ctx.zonaHoraria} />;
}
