import { getSessionContext } from '@/modules/core/auth/session';
import { can } from '@/modules/core/permissions/resolver';
import { NOMBRE_DTE } from '@/modules/ventas/domain/sii';
import { ventasRepository } from '@/modules/ventas/repositories/ventas.repository';
import { nombrePdf, traerPdfFactura } from '@/server/externos/pdf-factura';
import { createSupabaseServerClient } from '@/server/supabase/server';

/**
 * 04/11/2026 · Descarga del PDF de un documento emitido en el SII (?factura=ID&cual=cedible).
 * El link de Facturacion.cl es «http://»: el navegador lo bloquea desde IronTrack (https),
 * así que lo trae el servidor con la sesión del usuario (la base decide qué documentos ve).
 */
export const dynamic = 'force-dynamic';

const texto = (mensaje: string, status: number) =>
  new Response(mensaje, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

export async function GET(request: Request, { params }: { params: Promise<{ dte: string }> }) {
  const ctx = await getSessionContext();
  if (!ctx?.identidad) return texto('Iniciá sesión para descargar el PDF.', 401);
  if (!can(ctx.permisos, 'ventas.facturacion:ver')) return texto('No tenés acceso a Facturación.', 403);

  const { dte } = await params;
  const u = new URL(request.url);
  const facturaId = Number(u.searchParams.get('factura'));
  const dteId = Number(dte);
  const cedible = u.searchParams.get('cual') === 'cedible';
  if (!Number.isInteger(facturaId) || facturaId <= 0 || !Number.isInteger(dteId) || dteId <= 0) return texto('Falta la factura o el documento.', 400);

  let doc;
  try {
    const s = await ventasRepository(await createSupabaseServerClient()).siiFactura(facturaId);
    doc = s?.documentos.find((d) => d.id === dteId);
  } catch (e) {
    return texto(e instanceof Error ? e.message : 'No se pudo leer la factura.', 500);
  }
  const link = cedible ? doc?.urlCedible : doc?.urlOriginal;
  if (!doc || !link) return texto('Ese documento no tiene PDF.', 404);

  const r = await traerPdfFactura(link);
  if (!r.ok) return texto(`${r.error} Probá de nuevo en unos minutos.`, 502);
  return new Response(r.pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${nombrePdf(NOMBRE_DTE[doc.tipo] ?? `Documento-${doc.tipo}`, doc.folio, cedible)}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
