'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActionResult } from '@/server/actions/result';
import { invalidar } from '@/shared/query/invalidar';
import { browserDb } from '@/shared/supabase/browser';
import { agregarFotoActa, anularActa, cambiarActa, crearActa, firmarActa, quitarFotoActa } from '../actions/acta.actions';
import type { TipoActa } from '../domain/acta.types';
import { actaRepository } from '../repositories/acta.repository';

export interface FiltroActas {
  desde: string | null;
  hasta: string | null;
  choferId: number | null;
  tipo: TipoActa | null;
}

/** Migración 122: se piden solo si la base ya tiene las actas (activo). */
export const useActas = (f: FiltroActas, activo = true) =>
  useQuery({
    queryKey: ['actas', 'lista', f.desde, f.hasta, f.choferId, f.tipo] as const,
    queryFn: () => actaRepository(browserDb()).lista(f),
    enabled: activo,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

function useEscritura<I, T>(accion: (input: I) => Promise<ActionResult<T>>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: accion,
    onSuccess: async (r) => {
      if (!r.ok) return;
      await invalidar(qc, 'acta');
    },
  });
}

export const useCrearActa = () => useEscritura(crearActa);
export const useCambiarActa = () => useEscritura(cambiarActa);
export const useAgregarFotoActa = () => useEscritura(agregarFotoActa);
export const useQuitarFotoActa = () => useEscritura(quitarFotoActa);
export const useFirmarActa = () => useEscritura(firmarActa);
export const useAnularActa = () => useEscritura(anularActa);
