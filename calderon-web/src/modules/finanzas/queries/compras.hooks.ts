'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActionResult } from '@/server/actions/result';
import { browserDb } from '@/shared/supabase/browser';
import { invalidar } from '@/shared/query/invalidar';
import {
  anularCotizacionCompra,
  anularPedidoCompra,
  elevarPedidoCompra,
  guardarCotizacionCompra,
  guardarPedidoCompra,
  resolverPedidoCompra,
} from '../actions/compras.actions';
import { comprasRepository } from '../repositories/compras.repository';

/** Migración 280 · Compras: pedidos, cotizaciones, recomendación de Iris y orden de compra. */
export const usePedidosCompra = (todos: boolean) =>
  useQuery({ queryKey: ['finanzas', 'compras', 'lista', todos], queryFn: () => comprasRepository(browserDb()).pedidos(todos) });
export const usePedidoCompra = (id: number | null) =>
  useQuery({ queryKey: ['finanzas', 'compras', 'pedido', id], queryFn: () => comprasRepository(browserDb()).pedido(id!), enabled: id !== null });

function useEscritura<I, T>(accion: (input: I) => Promise<ActionResult<T>>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: accion, onSuccess: (r) => (r.ok ? invalidar(qc, 'finanzas') : undefined) });
}
export const useGuardarPedidoCompra = () => useEscritura(guardarPedidoCompra);
export const useGuardarCotizacionCompra = () => useEscritura(guardarCotizacionCompra);
export const useAnularCotizacionCompra = () => useEscritura(anularCotizacionCompra);
export const useElevarPedidoCompra = () => useEscritura(elevarPedidoCompra);
export const useResolverPedidoCompra = () => useEscritura(resolverPedidoCompra);
export const useAnularPedidoCompra = () => useEscritura(anularPedidoCompra);
