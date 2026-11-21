'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { REFRESCO } from '@/shared/query/frescura';
import { invalidar } from '@/shared/query/invalidar';
import { browserDb } from '@/shared/supabase/browser';
import { anularPedidoTablero, pedirFotoTablero } from '../actions/pedido-tablero.actions';
import { pedidoTableroRepository } from '../repositories/pedido-tablero.repository';

/** Migración 297 · Seguimiento de viajes: a qué camiones se les puede pedir la foto y cómo va cada pedido (cada minuto). */
export const usePedidosTablero = (enabled: boolean) =>
  useQuery({
    queryKey: ['telemetria', 'pedidos-tablero'] as const,
    queryFn: () => pedidoTableroRepository(browserDb()).lista(),
    enabled,
    refetchInterval: REFRESCO.bandeja,
  });

/** Migración 297 · Mi viaje: la foto que le pidió Telemetría. Se refresca sola al guardar el tablero (raíz «tablero»). */
export const useMisPedidosTablero = (enabled: boolean) =>
  useQuery({
    queryKey: ['tablero', 'mis-pedidos'] as const,
    queryFn: () => pedidoTableroRepository(browserDb()).misPedidos(),
    enabled,
    refetchInterval: 5 * 60_000,
  });

export function usePedirFotoTablero() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: pedirFotoTablero, onSuccess: (r) => (r.ok ? invalidar(qc, 'telemetria') : undefined) });
}

export function useAnularPedidoTablero() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: anularPedidoTablero, onSuccess: (r) => (r.ok ? invalidar(qc, 'telemetria') : undefined) });
}
