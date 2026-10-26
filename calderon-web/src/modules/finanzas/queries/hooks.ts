'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActionResult } from '@/server/actions/result';
import { browserDb } from '@/shared/supabase/browser';
import {
  anularGasto,
  anularMovimiento,
  conciliar,
  crearDesdeLinea,
  desconciliar,
  generarGastosFijos,
  guardarCuentaContable,
  guardarCuentaDinero,
  guardarGasto,
  guardarGastoFijo,
  guardarProveedorRapido,
  ignorarLinea,
  importarCartola,
  recontabilizar,
  registrarMovimiento,
} from '../actions/finanzas.actions';
import { finanzasRepository, type FiltroGastos } from '../repositories/finanzas.repository';

const CLAVE = ['finanzas'] as const;
const repo = () => finanzasRepository(browserDb());

export const useTableroFinanzas = () => useQuery({ queryKey: [...CLAVE, 'tablero'], queryFn: () => repo().tablero(), refetchInterval: 300_000 });
export const usePlanCuentas = () => useQuery({ queryKey: [...CLAVE, 'plan'], queryFn: () => repo().plan(), staleTime: 300_000 });
export const useCuentasDinero = (enabled = true) =>
  useQuery({ queryKey: [...CLAVE, 'cuentas-dinero'], queryFn: () => repo().cuentasDinero(), enabled, staleTime: 60_000 });
export const useGastos = (f: FiltroGastos) =>
  useQuery({ queryKey: [...CLAVE, 'gastos', f], queryFn: () => repo().gastos(f), placeholderData: keepPreviousData });
export const useGasto = (id: number | null) => useQuery({ queryKey: [...CLAVE, 'gasto', id], queryFn: () => repo().gasto(id!), enabled: !!id });
export const useGastosFijos = () => useQuery({ queryKey: [...CLAVE, 'fijos'], queryFn: () => repo().gastosFijos() });
export const useMovimientos = (cuenta: number | null, desde: string | null, hasta: string | null) =>
  useQuery({ queryKey: [...CLAVE, 'movimientos', cuenta, desde, hasta], queryFn: () => repo().movimientos(cuenta, desde, hasta), placeholderData: keepPreviousData });
export const useCamionesFinanzas = () => useQuery({ queryKey: [...CLAVE, 'camiones'], queryFn: () => repo().camiones(), staleTime: 600_000 });
export const usePorCobrar = () => useQuery({ queryKey: [...CLAVE, 'por-cobrar'], queryFn: () => repo().porCobrar() });
export const usePorPagar = () => useQuery({ queryKey: [...CLAVE, 'por-pagar'], queryFn: () => repo().porPagar() });
export const useCartola = (cuenta: number, soloPendientes: boolean) =>
  useQuery({ queryKey: [...CLAVE, 'cartola', cuenta, soloPendientes], queryFn: () => repo().cartola(cuenta, soloPendientes), placeholderData: keepPreviousData });
export const useEstadoResultados = (desde: string, hasta: string) =>
  useQuery({ queryKey: [...CLAVE, 'resultados', desde, hasta], queryFn: () => repo().estadoResultados(desde, hasta), placeholderData: keepPreviousData });
export const useFlujoCaja = (desde: string, hasta: string) =>
  useQuery({ queryKey: [...CLAVE, 'flujo', desde, hasta], queryFn: () => repo().flujoCaja(desde, hasta), placeholderData: keepPreviousData });
export const useLibroDiario = (desde: string, hasta: string, enabled: boolean) =>
  useQuery({ queryKey: [...CLAVE, 'diario', desde, hasta], queryFn: () => repo().libroDiario(desde, hasta), enabled });

function useEscritura<I, T>(accion: (input: I) => Promise<ActionResult<T>>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: accion,
    // Un cobro cambia también Ventas › Facturación
    onSuccess: (r) => (r.ok ? Promise.all([qc.invalidateQueries({ queryKey: CLAVE }), qc.invalidateQueries({ queryKey: ['ventas'] })]) : undefined),
  });
}
export const useGuardarCuentaContable = () => useEscritura(guardarCuentaContable);
export const useGuardarProveedorRapido = () => useEscritura(guardarProveedorRapido);
export const useGuardarCuentaDinero = () => useEscritura(guardarCuentaDinero);
export const useGuardarGasto = () => useEscritura(guardarGasto);
export const useAnularGasto = () => useEscritura(anularGasto);
export const useGuardarGastoFijo = () => useEscritura(guardarGastoFijo);
export const useGenerarGastosFijos = () => useEscritura(generarGastosFijos);
export const useRegistrarMovimiento = () => useEscritura(registrarMovimiento);
export const useAnularMovimiento = () => useEscritura(anularMovimiento);
export const useImportarCartola = () => useEscritura(importarCartola);
export const useConciliar = () => useEscritura(conciliar);
export const useDesconciliar = () => useEscritura(desconciliar);
export const useIgnorarLinea = () => useEscritura(ignorarLinea);
export const useCrearDesdeLinea = () => useEscritura(crearDesdeLinea);
export const useRecontabilizar = () => useEscritura(recontabilizar);
