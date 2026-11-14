'use client';

import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, LoaderCircle, Trash2 } from 'lucide-react';
import { BUCKET_OPERACION } from '@/modules/chofer/domain/chofer.types';
import { cn } from '@/shared/lib/cn';
import { idAleatorio } from '@/shared/lib/archivo';
import { invalidar } from '@/shared/query/invalidar';
import { browserDb } from '@/shared/supabase/browser';
import { BOTON_SECUNDARIO } from '@/shared/ui/clases';
import { asegurarMiniFoto, guardarFotoChofer } from '../../actions/chofer.actions';

/** Migración 239 · Foto de perfil del chofer. */

/**
 * Las fotos de varios choferes (enlaces temporales de 1 hora: el bucket es privado). La base dice qué rutas puede
 * ver cada uno (el chofer, solo la suya). Va bajo ['flota','choferes','lista'] para recargarse al guardar un chofer.
 */
export function useFotosChofer(ids: readonly (number | null | undefined)[]): Map<number, string> {
  const lista = [...new Set(ids.filter((x): x is number => typeof x === 'number' && x > 0))].sort((a, b) => a - b);
  const { data } = useQuery({
    queryKey: ['flota', 'choferes', 'lista', 'fotos', lista.join(',')] as const,
    enabled: lista.length > 0,
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const db = browserDb();
      const { data: filas, error } = await db.schema('ops').rpc('fn_fotos_chofer', { p_ids: lista });
      if (error) throw error;
      const rutas = (Array.isArray(filas) ? filas : []) as { id: number; ruta: string }[];
      if (rutas.length === 0) return new Map<number, string>();
      const firmadas = await db.storage.from(BUCKET_OPERACION).createSignedUrls(
        rutas.map((r) => r.ruta),
        3600,
      );
      const m = new Map<number, string>();
      rutas.forEach((r, i) => {
        const u = firmadas.data?.[i]?.signedUrl;
        if (u) m.set(Number(r.id), u);
      });
      return m;
    },
  });
  return data ?? new Map<number, string>();
}

const iniciales = (nombre: string) =>
  nombre
    .split(/[\s,]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');

/** La foto redonda (o las iniciales si no tiene). */
export function FotoChofer({ url, nombre, className }: { url: string | null | undefined; nombre: string; className?: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- enlace temporal de Storage
    <img src={url} alt={nombre} className={cn('size-9 shrink-0 rounded-full object-cover', className)} />
  ) : (
    <span
      aria-hidden
      className={cn('flex size-9 shrink-0 items-center justify-center rounded-full bg-marca-suave text-xs font-bold text-marca', className)}
    >
      {iniciales(nombre)}
    </span>
  );
}

/** Recorta al centro en cuadrado y achica a 400 px (JPEG): pesa poco y carga rápido en todas las listas. */
async function recortarCuadrado(archivo: Blob, maximo = 400): Promise<Blob> {
  const img = await createImageBitmap(archivo);
  const lado = Math.min(img.width, img.height);
  const tam = Math.min(maximo, lado);
  const lienzo = document.createElement('canvas');
  lienzo.width = tam;
  lienzo.height = tam;
  lienzo.getContext('2d')!.drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, tam, tam);
  return new Promise((ok, mal) => lienzo.toBlob((b) => (b ? ok(b) : mal(new Error('No se pudo leer la foto.'))), 'image/jpeg', 0.85));
}

async function aBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

/**
 * Migración 246 · Si la foto del chofer no tiene la copia chica para el mail (fotos cargadas antes del cambio 232),
 * la arma con la foto guardada y la manda a la base. No muestra nada; si falla, el mail sale sin foto.
 */
export function useAsegurarFotoMail(choferId: number | null) {
  useQuery({
    queryKey: ['flota', 'choferes', 'lista', 'foto-mail', choferId] as const,
    enabled: choferId !== null,
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      const db = browserDb();
      const { data } = await db.schema('ops').rpc('fn_fotos_chofer', { p_ids: [choferId!] });
      const fila = (Array.isArray(data) ? data[0] : null) as { ruta?: string; mini?: boolean } | null;
      if (!fila?.ruta || fila.mini !== false) return true;
      const descarga = await db.storage.from(BUCKET_OPERACION).download(fila.ruta);
      if (!descarga.data) return false;
      const r = await asegurarMiniFoto({ choferId: choferId!, mini: await aBase64(await recortarCuadrado(descarga.data, 160)) });
      return r.ok;
    },
  });
}

/** Ficha del chofer: la foto grande con «Cambiar foto» y «Quitar» (solo la oficina). */
export function FotoChoferFicha({ choferId, nombre, puedeEditar }: { choferId: number; nombre: string; puedeEditar: boolean }) {
  const fotos = useFotosChofer([choferId]);
  const qc = useQueryClient();
  const entrada = useRef<HTMLInputElement>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useAsegurarFotoMail(puedeEditar ? choferId : null);
  const url = fotos.get(choferId);

  const guardar = async (ruta: string | null, mini: string | null = null) => {
    const r = await guardarFotoChofer({ choferId, ruta, mini });
    if (!r.ok) {
      if (ruta) await browserDb().storage.from(BUCKET_OPERACION).remove([ruta]);
      setError(r.error.mensaje);
      return;
    }
    if (r.data.anterior) await browserDb().storage.from(BUCKET_OPERACION).remove([r.data.anterior]);
    await invalidar(qc, 'chofer');
  };

  const subir = async (archivo: File) => {
    setOcupado(true);
    setError(null);
    try {
      const blob = await recortarCuadrado(archivo);
      const ruta = `${choferId}/perfil/${idAleatorio()}.jpg`;
      const up = await browserDb().storage.from(BUCKET_OPERACION).upload(ruta, blob, { contentType: 'image/jpeg', upsert: false });
      if (up.error) throw new Error(`No se pudo subir la foto: ${up.error.message}`);
      // Migración 245: copia chica (160 px) para que la foto vaya dentro del mail de la orden de carga
      await guardar(ruta, await aBase64(await recortarCuadrado(archivo, 160)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo subir la foto.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <FotoChofer url={url} nombre={nombre} className="size-20 text-xl" />
      {puedeEditar && (
        <div className="space-y-1">
          <div className="flex flex-wrap gap-2">
            <button type="button" className={BOTON_SECUNDARIO} disabled={ocupado} onClick={() => entrada.current?.click()}>
              {ocupado ? <LoaderCircle className="size-4 animate-spin" /> : <Camera className="size-4" />} {url ? 'Cambiar foto' : 'Agregar foto'}
            </button>
            {url && (
              <button
                type="button"
                className={BOTON_SECUNDARIO}
                disabled={ocupado}
                onClick={async () => {
                  setOcupado(true);
                  setError(null);
                  await guardar(null);
                  setOcupado(false);
                }}
              >
                <Trash2 className="size-4" /> Quitar
              </button>
            )}
          </div>
          {error && <p className="text-sm text-error">{error}</p>}
          <input
            ref={entrada}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void subir(f);
            }}
          />
        </div>
      )}
    </div>
  );
}
