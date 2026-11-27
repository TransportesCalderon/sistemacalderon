'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActionResult } from '@/server/actions/result';
import { browserDb } from '@/shared/supabase/browser';
import { invalidar } from '@/shared/query/invalidar';
import { anularRecuperacionIva, guardarRecuperacionIva, resolverRecuperacionIva } from '../actions/iva-recuperar.actions';
import { ivaRecuperarRepository } from '../repositories/iva-recuperar.repository';

/** Migración 388 · IVA por recuperar. Si la base todavía no la tiene, la lectura falla y se avisa. */
export const useIvaPorRecuperar = () =>
  useQuery({ queryKey: ['finanzas', 'iva-por-recuperar'], queryFn: () => ivaRecuperarRepository(browserDb()).leer(), retry: false });

function useEscritura<I, T>(accion: (input: I) => Promise<ActionResult<T>>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: accion, onSuccess: (r) => (r.ok ? invalidar(qc, 'finanzas') : undefined) });
}
export const useGuardarRecuperacionIva = () => useEscritura(guardarRecuperacionIva);
export const useResolverRecuperacionIva = () => useEscritura(resolverRecuperacionIva);
export const useAnularRecuperacionIva = () => useEscritura(anularRecuperacionIva);
