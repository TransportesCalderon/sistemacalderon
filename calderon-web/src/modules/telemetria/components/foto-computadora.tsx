'use client';

import { useRef, useState } from 'react';
import { Camera, ExternalLink, LoaderCircle } from 'lucide-react';
import { BUCKET_OPERACION } from '@/modules/chofer/domain/chofer.types';
import { leerTableroSeguimiento } from '@/modules/ia/ia.actions';
import { iaRepository } from '@/modules/ia/ia.repository';
import { idAleatorio, prepararArchivo } from '@/shared/lib/archivo';
import { browserDb } from '@/shared/supabase/browser';
import { BOTON_SECUNDARIO } from '@/shared/ui/clases';
import type { LecturaFoto } from '../domain/seguimiento.types';
import { seguimientoRepository } from '../repositories/seguimiento.repository';

export interface FotoLeida {
  lecturaId: number;
  ruta: string;
  url: string;
  datos: LecturaFoto;
}

const espera = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

async function aBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

/**
 * Migración 240 · Foto de la computadora de a bordo (Mercedes y los que no tienen telemetría): se guarda en la carpeta
 * del viaje, la IA la lee y la base devuelve km, litros (calculados) y L/100 km para el control.
 */
export function SubirFotoComputadora({ viajeId, onLeida }: { viajeId: number; onLeida: (f: FotoLeida) => void }) {
  const entrada = useRef<HTMLInputElement>(null);
  const [fase, setFase] = useState<'quieto' | 'leyendo'>('quieto');
  const [error, setError] = useState<string | null>(null);

  const subir = async (archivo: File) => {
    setFase('leyendo');
    setError(null);
    try {
      const { blob, extension, tipo } = await prepararArchivo(archivo);
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(tipo)) throw new Error('La foto tiene que ser JPG, PNG o WEBP.');
      const ext = extension.toLowerCase().replace(/[^a-z]/g, '') || 'jpg';
      const ruta = `seguimiento/${viajeId}/${idAleatorio()}.${['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? ext : 'jpg'}`;
      const db = browserDb();
      const up = await db.storage.from(BUCKET_OPERACION).upload(ruta, blob, { contentType: tipo, upsert: false });
      if (up.error) throw new Error(`No se pudo subir la foto: ${up.error.message}`);
      const r = await leerTableroSeguimiento({ tipo: 'tablero_camion', base64: await aBase64(blob), mediaType: tipo as 'image/jpeg' });
      if (!r.ok) throw new Error(r.error.mensaje);
      const ia = iaRepository(db);
      let lista = false;
      for (let i = 0; i < 50 && !lista; i++) {
        const res = await ia.resultado(r.data);
        if (res.estado === 'error') throw new Error(res.error ?? 'La IA no pudo leer la foto: cargá los números a mano.');
        lista = res.estado === 'lista';
        if (!lista) await espera(1500);
      }
      if (!lista) throw new Error('La IA no respondió a tiempo: cargá los números a mano.');
      const datos = await seguimientoRepository(db).lecturaFoto(r.data);
      const firmada = await db.storage.from(BUCKET_OPERACION).createSignedUrl(ruta, 3600);
      onLeida({ lecturaId: r.data, ruta, url: firmada.data?.signedUrl ?? '', datos });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer la foto.');
    } finally {
      setFase('quieto');
    }
  };

  return (
    <div className="space-y-1">
      <button type="button" className={BOTON_SECUNDARIO} disabled={fase === 'leyendo'} onClick={() => entrada.current?.click()}>
        {fase === 'leyendo' ? <LoaderCircle className="size-4 animate-spin" /> : <Camera className="size-4" />}
        {fase === 'leyendo' ? 'Leyendo la foto…' : 'Subir foto de la computadora de a bordo'}
      </button>
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
  );
}

/** Abre la foto guardada de un control (enlace temporal: el bucket es privado). */
export function VerFotoControl({ ruta }: { ruta: string }) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-marca hover:underline"
      onClick={async () => {
        const ventana = window.open('', '_blank');
        const { data } = await browserDb().storage.from(BUCKET_OPERACION).createSignedUrl(ruta, 300);
        if (data && ventana) ventana.location.href = data.signedUrl;
        else ventana?.close();
      }}
    >
      <ExternalLink className="size-3.5" /> Ver foto
    </button>
  );
}
