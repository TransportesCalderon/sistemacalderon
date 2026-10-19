/**
 * Archivos que se suben desde el navegador (fotos y PDF de tickets).
 * Las fotos se achican antes de subir (lado mayor 2000 px, JPEG): un ticket se lee igual y
 * ocupa una décima parte. Los PDF se suben tal cual.
 */
const LADO_MAXIMO = 2000;
export const TAMANO_MAXIMO_BYTES = 10 * 1024 * 1024;

export async function prepararArchivo(archivo: File): Promise<{ blob: Blob; extension: string; tipo: string }> {
  if (archivo.type === 'application/pdf') return { blob: archivo, extension: 'pdf', tipo: archivo.type };
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
