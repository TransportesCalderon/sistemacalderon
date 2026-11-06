import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { isIP } from 'node:net';
import { notFound } from 'next/navigation';
import { requirePermiso } from '@/modules/core/auth/guards';
import { can } from '@/modules/core/permissions/resolver';
import { ActaImprimible, type DocumentoActa } from '@/modules/actas/components/acta-imprimible';
import { actaRepository } from '@/modules/actas/repositories/acta.repository';
import { BUCKET_OPERACION } from '@/modules/chofer/domain/chofer.types';
import { choferRepository } from '@/modules/flota/repositories/chofer.repository';
import { createSupabaseServerClient } from '@/server/supabase/server';
import type { ChoferId } from '@/shared/types/dominio';

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: 'Acta de infracción' };

/**
 * Migración 122 · El acta de infracción en una hoja A4 (formato de nota de la empresa), para que la firme el chofer.
 * Fuera del marco de la aplicación. Las fotos se muestran con enlaces temporales; el RUT y el documento del
 * chofer, solo si el usuario puede ver el documento (el acceso queda registrado, como en la ficha del chofer).
 */
export default async function Pagina({ params }: Props) {
  const ctx = await requirePermiso('operacion.actas:ver');
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const db = await createSupabaseServerClient();
  const acta = await actaRepository(db).detalle(id).catch(() => null);
  if (!acta) notFound();

  let documento: DocumentoActa | null = null;
  if (can(ctx.permisos, 'flota.documento_chofer:ver')) {
    const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
    const d = await choferRepository(db)
      .revelarDocumento(acta.choferId as ChoferId, { motivo: `Acta de infracción ${acta.numero}`, ip: ip && isIP(ip) ? ip : null })
      .catch(() => null);
    if (d) documento = { rut: d.rutChile ?? null, documento: d.numero ? `${d.numero}${d.tipo && d.tipo !== 'OTRO' ? ` (${d.tipo})` : ''}` : null };
  }

  let fotos: { url: string; nombre: string | null }[] = [];
  if (acta.fotos.length > 0) {
    const r = await db.storage.from(BUCKET_OPERACION).createSignedUrls(acta.fotos.slice(0, 6).map((f) => f.ruta), 60 * 30);
    if (!r.error) fotos = r.data.flatMap((x, i) => (x.signedUrl ? [{ url: x.signedUrl, nombre: acta.fotos[i]?.nombre ?? null }] : []));
  }

  return <ActaImprimible a={acta} zonaHoraria={ctx.zonaHoraria} documento={documento} fotos={fotos} />;
}
