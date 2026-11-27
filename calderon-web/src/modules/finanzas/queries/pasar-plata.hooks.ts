'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActionResult } from '@/server/actions/result';
import { browserDb } from '@/shared/supabase/browser';
import { invalidar } from '@/shared/query/invalidar';
import { anularTransferencia, pasarPlata } from '../actions/pasar-plata.actions';
import { pasarPlataRepository } from '../repositories/pasar-plata.repository';

/**
 * Migración 388 · Las cuentas de «Hoy». La clave empieza con «finanzas»: se vuelve a leer con cualquier guardado de
 * Finanzas (un cobro, un pago, una transferencia). Si la base todavía no tiene la migración, devuelve null y no reintenta.
 */
export const useCuentasHoy = (activo = true) =>
  useQuery({
    queryKey: ['finanzas', 'cuentas-hoy'],
    queryFn: () => pasarPlataRepository(browserDb()).cuentasHoy(),
    enabled: activo,
    staleTime: 60_000,
    refetchInterval: 300_000,
  });

function useEscritura<I, T>(accion: (input: I) => Promise<ActionResult<T>>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: accion, onSuccess: (r) => (r.ok ? invalidar(qc, 'finanzas') : undefined) });
}
export const usePasarPlata = () => useEscritura(pasarPlata);
export const useAnularTransferencia = () => useEscritura(anularTransferencia);
