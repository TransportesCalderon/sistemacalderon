/** Un texto del PDF con su posición (puntos; y crece hacia arriba, como en pdf.js). */
export interface TextoPdf {
  pagina: number;
  x: number;
  y: number;
  texto: string;
}

/** Migración 365 · Los textos de un PDF con texto (no escaneado), con su posición. Solo en el navegador. */
export async function textosPdf(archivo: Blob): Promise<TextoPdf[]> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await archivo.arrayBuffer()) }).promise;
  try {
    const textos: TextoPdf[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const pagina = await doc.getPage(p);
      const contenido = await pagina.getTextContent();
      for (const it of contenido.items) {
        if ('str' in it && it.str.trim()) textos.push({ pagina: p, x: it.transform[4], y: it.transform[5], texto: it.str });
      }
    }
    return textos;
  } finally {
    await doc.destroy();
  }
}
