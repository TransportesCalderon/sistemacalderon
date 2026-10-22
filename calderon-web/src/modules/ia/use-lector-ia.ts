'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { prepararArchivo } from '@/shared/lib/archivo';
import { browserDb } from '@/shared/supabase/browser';
import { leerComprobanteGasto, leerTicketCombustible, marcarLecturaCombustible, marcarLecturaGasto } from './ia.actions';
import { iaRepository, type PropuestaIA, type TipoLectura } from './ia.repository';

const espera = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

async function aBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

export type EstadoLector =
  | { fase: 'quieto' }
  | { fase: 'leyendo' }
  | { fase: 'listo'; lecturaId: number; propuesta: PropuestaIA; avisos: string[]; reutilizada: boolean }
  | { fase: 'error'; mensaje: string };

/**
 * Lector de tickets con IA: achica la foto, la manda a la base (que llama a la IA) y pregunta
 * cada segundo y medio hasta que está la respuesta. Si la IA no está activada, no aparece.
 */
export function useLectorIA(tipo: TipoLectura) {
  const disponible = useQuery({ queryKey: ['ia', 'estado'], queryFn: () => iaRepository(browserDb()).estado(), staleTime: 300_000 });
  const [estado, setEstado] = useState<EstadoLector>({ fase: 'quieto' });

  const leer = async (archivo: File) => {
    setEstado({ fase: 'leyendo' });
    try {
      const { blob, tipo: media } = await prepararArchivo(archivo);
      if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(media)) {
        setEstado({ fase: 'error', mensaje: 'La IA no puede leer este formato de foto: completá a mano.' });
        return null;
      }
      const base64 = await aBase64(blob);
      const accion = tipo === 'ticket_combustible' ? leerTicketCombustible : leerComprobanteGasto;
      const r = await accion({ tipo, base64, mediaType: media } as never);
      if (!r.ok) {
        setEstado({ fase: 'error', mensaje: r.error.mensaje });
        return null;
      }
      const repo = iaRepository(browserDb());
      for (let i = 0; i < 50; i++) {
        const res = await repo.resultado(r.data);
        if (res.estado === 'lista' && res.propuesta) {
          const listo = { fase: 'listo' as const, lecturaId: res.id, propuesta: res.propuesta, avisos: res.avisos, reutilizada: res.reutilizada };
          setEstado(listo);
          return listo;
        }
        if (res.estado === 'error') {
          setEstado({ fase: 'error', mensaje: res.error ?? 'La IA no pudo leer la foto.' });
          return null;
        }
        await espera(1500);
      }
      setEstado({ fase: 'error', mensaje: 'La IA no respondió a tiempo: completá a mano.' });
    } catch (e) {
      setEstado({ fase: 'error', mensaje: e instanceof Error ? e.message : 'No se pudo leer la foto.' });
    }
    return null;
  };

  /** Lo que la persona terminó guardando (para medir los aciertos). No frena nada si falla. */
  const marcarUsada = async (guardado: Record<string, unknown>) => {
    if (estado.fase !== 'listo') return;
    const accion = tipo === 'ticket_combustible' ? marcarLecturaCombustible : marcarLecturaGasto;
    try {
      await accion({ lecturaId: estado.lecturaId, guardado });
    } catch {
      // solo estadística
    }
  };

  return { disponible: disponible.data === true, estado, leer, marcarUsada, reiniciar: () => setEstado({ fase: 'quieto' }) };
}
