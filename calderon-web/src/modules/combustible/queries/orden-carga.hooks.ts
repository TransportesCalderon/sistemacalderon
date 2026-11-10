'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { browserDb } from '@/shared/supabase/browser';
import { invalidar } from '@/shared/query/invalidar';
import { anularOrdenCarga, crearOrdenCarga, guardarCorreoEstacion, revisarOrdenCarga, terminarOrdenCarga } from '../actions/orden-carga.actions';
import { ordenCargaRepository } from '../repositories/orden-carga.repository';

/** Migración 234 · Órdenes de carga de combustible. */
const repo = () => ordenCargaRepository(browserDb());

export const useOrdenesCarga = (activo: boolean) =>
  useQuery({ queryKey: ['combustible', 'ordenes', 'lista'] as const, queryFn: () => repo().lista(30), enabled: activo, refetchInterval: activo ? 30_000 : false });

export const usePrepararOrden = (camionId: number | null, estacionId: number | null) =>
  useQuery({
    queryKey: ['combustible', 'ordenes', 'preparar', camionId, estacionId] as const,
    queryFn: () => repo().preparar(camionId!, estacionId),
    enabled: camionId !== null,
  });

export const useMisOrdenesCarga = (activo: boolean) =>
  useQuery({ queryKey: ['chofer', 'ordenes-carga'] as const, queryFn: () => repo().misOrdenes(), enabled: activo, refetchInterval: activo ? 15_000 : false });

function useAccion<A, R>(accion: (a: A) => Promise<R>, objeto: 'combustible' | 'chofer_portal' | 'catalogo') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: accion,
    onSuccess: async (r) => {
      if ((r as { ok?: boolean }).ok === false) return;
      await invalidar(qc, objeto);
    },
  });
}

export const useCrearOrdenCarga = () => useAccion(crearOrdenCarga, 'combustible');
export const useAnularOrdenCarga = () => useAccion(anularOrdenCarga, 'combustible');
export const useRevisarOrdenCarga = () => useAccion(revisarOrdenCarga, 'combustible');
export const useCorreoEstacion = () => useAccion(guardarCorreoEstacion, 'catalogo');
export const useTerminarOrdenCarga = () => useAccion(terminarOrdenCarga, 'chofer_portal');
