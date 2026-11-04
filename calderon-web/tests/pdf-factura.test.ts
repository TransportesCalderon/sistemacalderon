import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

describe('PDF de la factura (04/11/2026)', () => {
  it('solo acepta links de Facturacion.cl', async () => {
    const { esLinkFacturacion } = await import('@/server/externos/pdf-factura');
    expect(esLinkFacturacion('http://www.facturacion.cl/aureacargospa/descargar.php?x=1')).toBe(true);
    expect(esLinkFacturacion('https://facturacion.cl/a.pdf')).toBe(true);
    expect(esLinkFacturacion('http://facturacion.cl.malo.com/a')).toBe(false);
    expect(esLinkFacturacion('file:///etc/passwd')).toBe(false);
  });

  it('el nombre del archivo dice qué documento es', async () => {
    const { nombrePdf } = await import('@/server/externos/pdf-factura');
    expect(nombrePdf('Factura de exportación', 18, false)).toBe('Factura-de-exportacion-18.pdf');
    expect(nombrePdf('Factura exenta', 29, true)).toBe('Factura-exenta-29-cedible.pdf');
  });

  it('prueba primero por https y entrega solo si es un PDF', async () => {
    const { traerPdfFactura } = await import('@/server/externos/pdf-factura');
    const pedidos: string[] = [];
    const pdf = new TextEncoder().encode('%PDF-1.4 zz');
    vi.stubGlobal('fetch', async (url: string) => {
      pedidos.push(url);
      if (url.startsWith('https:')) throw new Error('sin https');
      return new Response(pdf, { status: 200 });
    });
    const r = await traerPdfFactura('http://www.facturacion.cl/aureacargospa/descargar.php?x=1');
    expect(r.ok).toBe(true);
    expect(pedidos).toEqual(['https://www.facturacion.cl/aureacargospa/descargar.php?x=1', 'http://www.facturacion.cl/aureacargospa/descargar.php?x=1']);
    vi.stubGlobal('fetch', async () => new Response('<html>login</html>', { status: 200 }));
    const r2 = await traerPdfFactura('http://www.facturacion.cl/a/descargar.php');
    expect(r2.ok).toBe(false);
    vi.unstubAllGlobals();
  });

  it('la factura descarga por IronTrack, no por el link http', async () => {
    const { readFileSync } = await import('node:fs');
    const c = readFileSync('src/modules/ventas/components/factura-sii.tsx', 'utf8');
    expect(c).toContain('/ventas/facturacion/pdf/');
    expect(c).not.toContain('href={d.urlOriginal}');
  });
});
