/**
 * Archivos que se suben desde el navegador (fotos y PDF de tickets, comprobantes…).
 * Las fotos se achican antes de subir (lado mayor 2000 px, JPEG): un ticket se lee igual y
 * ocupa una décima parte. Pedido de Gerencia (30/10/2026): los PDF pesados también se comprimen
 * (cada página a una imagen liviana en un PDF nuevo) para no gastar disco de más; si no achica,
 * se sube el original.
 */
const LADO_MAXIMO = 2000;
export const TAMANO_MAXIMO_BYTES = 10 * 1024 * 1024;

export async function prepararArchivo(archivo: File): Promise<{ blob: Blob; extension: string; tipo: string }> {
  if (archivo.type === 'application/pdf' || /\.pdf$/i.test(archivo.name)) {
    const chico = await comprimirPdf(archivo).catch(() => null);
    return { blob: chico ?? archivo, extension: 'pdf', tipo: 'application/pdf' };
  }
  if (!archivo.type.startsWith('image/')) throw new Error('El archivo tiene que ser una foto o un PDF.');
  try {
    const imagen = await createImageBitmap(archivo);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(imagen.width, imagen.height));
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(imagen.width * escala);
    lienzo.height = Math.round(imagen.height * escala);
    lienzo.getContext('2d')?.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
    const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, 'image/jpeg', 0.82));
    if (blob && blob.size < archivo.size) return { blob, extension: 'jpg', tipo: 'image/jpeg' };
  } catch {
    // Si el navegador no puede leer la imagen (por ejemplo HEIC), se sube la original
  }
  return { blob: archivo, extension: archivo.name.split('.').pop() ?? 'jpg', tipo: archivo.type };
}

/** SHA-256 en hexadecimal (la base lo usa para detectar el mismo archivo en dos cargas). */
export async function sha256Hex(blob: Blob): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function idAleatorio(): string {
  return crypto.randomUUID();
}

/** Un PDF de menos de esto ya es liviano: se sube tal cual. */
const PDF_LIVIANO = 700 * 1024;
const PDF_MAX_PAGINAS = 40;
/** Ancho de cada página al re-armar (≈ 150 ppp en A4) y calidad del JPEG. */
const PDF_ANCHO_PX = 1240;
const PDF_CALIDAD = 0.6;

/**
 * Re-arma el PDF con cada página como JPEG liviano (pdf.js para dibujarla, pdf-lib para armarlo).
 * Devuelve null si no conviene (es chico, tiene muchas páginas o no achica).
 */
export async function comprimirPdf(archivo: Blob): Promise<Blob | null> {
  if (archivo.size <= PDF_LIVIANO || typeof document === 'undefined') return null;
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const { PDFDocument } = await import('pdf-lib');
  const origen = await pdfjs.getDocument({ data: new Uint8Array(await archivo.arrayBuffer()) }).promise;
  try {
    if (origen.numPages > PDF_MAX_PAGINAS) return null;
    const nuevo = await PDFDocument.create();
    for (let i = 1; i <= origen.numPages; i++) {
      const pagina = await origen.getPage(i);
      const base = pagina.getViewport({ scale: 1 });
      const escala = Math.min(2, PDF_ANCHO_PX / base.width);
      const vista = pagina.getViewport({ scale: escala });
      const lienzo = document.createElement('canvas');
      lienzo.width = Math.round(vista.width);
      lienzo.height = Math.round(vista.height);
      const ctx = lienzo.getContext('2d');
      if (!ctx) return null;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, lienzo.width, lienzo.height);
      await pagina.render({ canvasContext: ctx, viewport: vista }).promise;
      const jpg = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, 'image/jpeg', PDF_CALIDAD));
      if (!jpg) return null;
      const imagen = await nuevo.embedJpg(new Uint8Array(await jpg.arrayBuffer()));
      // La página conserva su tamaño en puntos (se imprime igual)
      nuevo.addPage([base.width, base.height]).drawImage(imagen, { x: 0, y: 0, width: base.width, height: base.height });
      pagina.cleanup();
    }
    const bytes = await nuevo.save();
    const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
    return blob.size < archivo.size * 0.9 ? blob : null;
  } finally {
    void origen.destroy();
  }
}
