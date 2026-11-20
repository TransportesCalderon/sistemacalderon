'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActionResult } from '@/server/actions/result';
import { browserDb } from '@/shared/supabase/browser';
import { invalidar } from '@/shared/query/invalidar';
import { anularOrdenPago, aplicarPagosACuenta, registrarOrdenPago } from '../actions/orden-pago.actions';
import { ordenPagoRepository } from '../repositories/orden-pago.repository';

/** Migración 281 · Cuenta corriente de proveedores. Las claves empiezan con «finanzas»: se recargan con cualquier guardado de Finanzas. */
export const useSaldosProveedores = () =>
  useQuery({ queryKey: ['finanzas', 'proveedores-saldos'], queryFn: () => ordenPagoRepository(browserDb()).saldos() });

export const useCuentaProveedor = (proveedorId: number | null, moneda: string | null) =>
  useQuery({
    queryKey: ['finanzas', 'proveedor-cuenta', proveedorId, moneda],
    queryFn: () => ordenPagoRepository(browserDb()).cuenta(proveedorId ?? 0, moneda ?? 'CLP'),
    enabled: proveedorId !== null && moneda !== null,
  });

function useEscritura<I, T>(accion: (input: I) => Promise<ActionResult<T>>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: accion, onSuccess: (r) => (r.ok ? invalidar(qc, 'finanzas') : undefined) });
}
export const useRegistrarOrdenPago = () => useEscritura(registrarOrdenPago);
export const useAplicarPagosACuenta = () => useEscritura(aplicarPagosACuenta);
export const useAnularOrdenPago = () => useEscritura(anularOrdenPago);
