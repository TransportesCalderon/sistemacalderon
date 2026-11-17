'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActionResult } from '@/server/actions/result';
import { browserDb } from '@/shared/supabase/browser';
import { invalidar } from '@/shared/query/invalidar';
import { anularCompraRodado, registrarCompraRodado } from '../actions/compra-rodado.actions';
import { compraRodadoRepository } from '../repositories/compra-rodado.repository';

/** Compra de vehículos con documentos. Si la base todavía no tiene la migración, la lectura falla y el bloque no aparece. */
export const useComprasRodados = () =>
  useQuery({ queryKey: ['finanzas', 'compras-rodados'], queryFn: () => compraRodadoRepository(browserDb()).listar(), retry: false });

function useEscritura<I, T>(accion: (input: I) => Promise<ActionResult<T>>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: accion, onSuccess: (r) => (r.ok ? invalidar(qc, 'finanzas') : undefined) });
}
export const useRegistrarCompraRodado = () => useEscritura(registrarCompraRodado);
export const useAnularCompraRodado = () => useEscritura(anularCompraRodado);
