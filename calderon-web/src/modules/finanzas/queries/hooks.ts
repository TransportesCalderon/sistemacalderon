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
  guardarMedioPago,
  vincularCargas,
  guardarProveedorRapido,
  ignorarLinea,
  importarCartola,
  recontabilizar,
  registrarMovimiento,
} from '../actions/finanzas.actions';
import { finanzasRepository, type FiltroGastos } from '../repositories/finanzas.repository';
import { invalidar } from '@/shared/query/invalidar';

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

// Migración 74
export const useCuentasParaElegir = (enabled = true) =>
  useQuery({ queryKey: [...CLAVE, 'cuentas-elegir'], queryFn: () => repo().cuentasParaElegir(), enabled, staleTime: 60_000, retry: false });
export const useMayor = (cuenta: number | null, desde: string, hasta: string, terceroTipo: string | null, terceroId: number | null) =>
  useQuery({
    queryKey: [...CLAVE, 'mayor', cuenta, desde, hasta, terceroTipo, terceroId],
    queryFn: () => repo().mayor(cuenta!, desde, hasta, terceroTipo, terceroId),
    enabled: !!cuenta,
    placeholderData: keepPreviousData,
  });
export const useAuxiliares = (hasta: string | null) => useQuery({ queryKey: [...CLAVE, 'auxiliares', hasta], queryFn: () => repo().auxiliares(hasta) });
export const useTraza = (origen: string, id: number | null) =>
  useQuery({ queryKey: [...CLAVE, 'traza', origen, id], queryFn: () => repo().traza(origen, id!), enabled: !!id });
export const useCombustibleFinanzas = () => useQuery({ queryKey: [...CLAVE, 'combustible'], queryFn: () => repo().combustible() });
export const useCargasPorFacturar = (proveedor: number | null, gasto: number | null) =>
  useQuery({ queryKey: [...CLAVE, 'cargas-por-facturar', proveedor, gasto], queryFn: () => repo().cargasPorFacturar(proveedor!, gasto), enabled: !!proveedor });
export const usePendientesContables = () => useQuery({ queryKey: [...CLAVE, 'pendientes'], queryFn: () => repo().pendientes() });

function useEscritura<I, T>(accion: (input: I) => Promise<ActionResult<T>>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: accion,
    // Un cobro cambia también Ventas › Facturación
    onSuccess: (r) => (r.ok ? invalidar(qc, 'finanzas') : undefined),
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
export const useGuardarMedioPago = () => useEscritura(guardarMedioPago);
export const useVincularCargas = () => useEscritura(vincularCargas);
