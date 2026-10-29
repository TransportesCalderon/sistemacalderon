'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { browserDb } from '@/shared/supabase/browser';
import {
  bajaSemi,
  eliminarGenset,
  eliminarTipoAccesorio,
  guardarEdicionPizarra,
  guardarGenset,
  guardarSemi,
  guardarTipoAccesorio,
  instalarGenset,
  retirarGenset,
} from '../actions/pizarra.actions';
import { pizarraQueries as q } from './keys';
import { invalidar } from '@/shared/query/invalidar';

/** Respaldo por si el tiempo real se corta: la Pizarra se vuelve a leer igual cada 60 s. */
const RESPALDO_MS = 60_000;
/** Varios avisos seguidos (una asignación toca 4 tablas) se juntan en una sola lectura. */
const JUNTAR_MS = 1_000;

export const usePizarra = () => useQuery({ ...q.filas(browserDb()), refetchInterval: RESPALDO_MS });
/** Sprint 6: solo con la base en la migración 118 (antes la función no existe). */
export const usePizarraSigue = (enabled: boolean) => useQuery({ ...q.sigue(browserDb()), enabled, refetchInterval: RESPALDO_MS });
export const useColumnasAccesorio = () => useQuery({ ...q.columnas(browserDb()), refetchInterval: RESPALDO_MS });
export const useLugares = () => useQuery(q.lugares(browserDb()));
export const useSemis = () => useQuery(q.semis(browserDb()));
export const useTiposAccesorio = () => useQuery(q.tipos(browserDb()));
export const useGensets = () => useQuery(q.gensets(browserDb()));

export type EstadoVivo = 'conectando' | 'en_vivo' | 'reconectando';

/**
 * Tiempo real (Supabase Realtime, canal «pizarra»): la base avisa «cambió la pizarra» sin datos
 * y acá se vuelve a leer todo por la vía normal, con los permisos del usuario.
 */
export function usePizarraEnVivo(objeto: 'pizarra_en_vivo' | 'viajes_en_vivo' = 'pizarra_en_vivo'): EstadoVivo {
  const qc = useQueryClient();
  const [estado, setEstado] = useState<EstadoVivo>('conectando');
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const db = browserDb();
    // viajes_en_vivo: también la lista de Logística, que depende de lo mismo (shared/query/invalidar.ts)
    const refrescar = () => void invalidar(qc, objeto);
    const canal = db
      .channel('pizarra')
      .on('broadcast', { event: 'cambio' }, () => {
        if (espera.current) clearTimeout(espera.current);
        espera.current = setTimeout(refrescar, JUNTAR_MS);
      })
      .subscribe((s) => {
        if (s === 'SUBSCRIBED') {
          setEstado('en_vivo');
          refrescar(); // lo que cambió mientras no había conexión
        } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') {
          setEstado('reconectando');
        }
      });
    return () => {
      if (espera.current) clearTimeout(espera.current);
      void db.removeChannel(canal);
    };
  }, [qc, objeto]);

  return estado;
}

function useEscritura<I, R extends { ok: boolean }>(accion: (input: I) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: accion,
    onSuccess: async (r) => {
      if (!r.ok) return;
      // Los gensets también se eligen en Combustible y en Operaciones (shared/query/invalidar.ts)
      await invalidar(qc, 'pizarra');
    },
  });
}

export const useGuardarEdicionPizarra = () => useEscritura(guardarEdicionPizarra);
export const useGuardarSemi = () => useEscritura(guardarSemi);
export const useBajaSemi = () => useEscritura(bajaSemi);
export const useGuardarTipoAccesorio = () => useEscritura(guardarTipoAccesorio);
export const useEliminarTipoAccesorio = () => useEscritura(eliminarTipoAccesorio);
export const useGuardarGenset = () => useEscritura(guardarGenset);
export const useEliminarGenset = () => useEscritura(eliminarGenset);
export const useInstalarGenset = () => useEscritura(instalarGenset);
export const useRetirarGenset = () => useEscritura(retirarGenset);
