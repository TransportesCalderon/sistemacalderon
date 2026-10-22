'use client';

import { idAleatorio, prepararArchivo, sha256Hex } from '@/shared/lib/archivo';
import { browserDb } from '@/shared/supabase/browser';
import { BUCKET_OPERACION } from '../domain/chofer.types';

const TAMANO_MAXIMO = 15 * 1024 * 1024;

/**
 * Sube una foto o PDF al bucket privado de documentos de operación. La foto se achica antes
 * (se lee igual y sube rápido con poca señal). Storage solo deja al chofer escribir en la
 * carpeta con su número; la oficina usa la carpeta «oficina».
 */
export async function subirArchivo(archivo: File, carpeta: string): Promise<{ ruta: string; hash: string; nombre: string }> {
  const { blob, extension, tipo } = await prepararArchivo(archivo);
  if (blob.size > TAMANO_MAXIMO) throw new Error('El archivo supera los 15 MB.');
  const hash = await sha256Hex(blob);
  const ruta = `${carpeta}/${idAleatorio()}.${extension.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'}`;
  const r = await browserDb().storage.from(BUCKET_OPERACION).upload(ruta, blob, { contentType: tipo, upsert: false });
  if (r.error) throw new Error(`No se pudo subir el archivo: ${r.error.message}`);
  return { ruta, hash, nombre: archivo.name.slice(0, 200) };
}

/** Borra un archivo que no llegó a registrarse (o que se quitó). Si falla, no importa. */
export async function borrarArchivo(ruta: string | null | undefined) {
  if (!ruta) return;
  try {
    await browserDb().storage.from(BUCKET_OPERACION).remove([ruta]);
  } catch {
    // queda huérfano en Storage; no afecta a los datos
  }
}

/** Abre el archivo con un enlace temporal (5 minutos): el bucket es privado. */
export async function abrirArchivo(ruta: string): Promise<string | null> {
  const ventana = window.open('', '_blank');
  const { data, error } = await browserDb().storage.from(BUCKET_OPERACION).createSignedUrl(ruta, 300);
  if (error || !data) {
    ventana?.close();
    return error?.message ?? 'No se pudo abrir el archivo.';
  }
  if (ventana) ventana.location.href = data.signedUrl;
  return null;
}

/** Posición actual del celular, si el chofer la permite (para fechar dónde se sacó la foto). */
export function posicionActual(timeoutMs = 4000): Promise<{ latitud: number; longitud: number } | null> {
  return new Promise((ok) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return ok(null);
    navigator.geolocation.getCurrentPosition(
      (p) => ok({ latitud: p.coords.latitude, longitud: p.coords.longitude }),
      () => ok(null),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 120_000 },
    );
  });
}
