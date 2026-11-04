import 'server-only';

/**
 * 04/11/2026: Facturacion.cl entrega el PDF con un link «http://www.facturacion.cl/…/descargar.php?…».
 * Desde IronTrack (https) el navegador bloquea esa descarga insegura, por eso no bajaba.
 * El servidor lo trae (primero por https y, si no responde, por http) y lo entrega como descarga.
 * Solo acepta links de facturacion.cl.
 */
export function esLinkFacturacion(link: string): boolean {
  try {
    const u = new URL(link);
    return ['http:', 'https:'].includes(u.protocol) && /(^|\.)facturacion\.cl$/i.test(u.hostname);
  } catch {
    return false;
  }
}

export async function traerPdfFactura(link: string): Promise<{ ok: true; pdf: ArrayBuffer } | { ok: false; error: string }> {
  if (!esLinkFacturacion(link)) return { ok: false, error: 'El link del PDF no es de Facturacion.cl.' };
  const seguro = link.replace(/^http:/i, 'https:');
  let ultimo = 'Facturacion.cl no respondió.';
  for (const url of seguro === link ? [link] : [seguro, link]) {
    try {
      const r = await fetch(url, { cache: 'no-store', redirect: 'follow', signal: AbortSignal.timeout(20_000) });
      const pdf = await r.arrayBuffer();
      const esPdf = new TextDecoder().decode(pdf.slice(0, 5)) === '%PDF-';
      if (r.ok && esPdf) return { ok: true, pdf };
      ultimo = r.ok ? 'Facturacion.cl no devolvió un PDF (puede que el link haya vencido).' : `Facturacion.cl respondió HTTP ${r.status}.`;
    } catch (e) {
      ultimo = `Facturacion.cl no respondió (${e instanceof Error ? e.message : 'error'}).`;
    }
  }
  return { ok: false, error: ultimo };
}

/** Nombre del archivo: «Factura-exenta-29.pdf», «Factura-de-exportacion-18.pdf»… */
export function nombrePdf(nombreDte: string, folio: number | null, cedible: boolean): string {
  const base = nombreDte.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-');
  return `${base}-${folio ?? 'sin-folio'}${cedible ? '-cedible' : ''}.pdf`;
}
