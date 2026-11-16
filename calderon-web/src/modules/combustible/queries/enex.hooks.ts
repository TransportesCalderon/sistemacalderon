'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { browserDb } from '@/shared/supabase/browser';
import { invalidar } from '@/shared/query/invalidar';
import { corregirCargaEnex, descartarCargaEnex, registrarCargaEnex } from '../actions/enex.actions';
import { enexRepository } from '../repositories/enex.repository';

/** Shell 02 · Cargas de Shell Card (Enex) por resolver. */
const CLAVE = ['combustible', 'enex', 'pendientes'] as const;

export const usePendientesEnex = (activo: boolean) =>
  useQuery({ queryKey: CLAVE, queryFn: () => enexRepository(browserDb()).pendientes(), enabled: activo, refetchInterval: activo ? 120_000 : false, retry: false });

function useAccion<A, R>(accion: (a: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: accion,
    onSuccess: async (r) => {
      if ((r as { ok?: boolean }).ok === false) return;
      await invalidar(qc, 'combustible'); // refresca todo lo de combustible, incluida esta lista
    },
  });
}

export const useRegistrarCargaEnex = () => useAccion(registrarCargaEnex);
export const useCorregirCargaEnex = () => useAccion(corregirCargaEnex);
export const useDescartarCargaEnex = () => useAccion(descartarCargaEnex);
