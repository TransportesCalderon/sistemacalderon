'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActionResult } from '@/server/actions/result';
import { browserDb } from '@/shared/supabase/browser';
import {
  anularCotizacion,
  anularFactura,
  cobrarFactura,
  completarActividad,
  crearFactura,
  duplicarCotizacion,
  emitirFactura,
  enviarCotizacion,
  guardarActividad,
  guardarAdicional,
  guardarContacto,
  guardarCotizacion,
  guardarEmpresa,
  guardarFactura,
  guardarNegocio,
  guardarParametros,
  guardarTarifa,
  hacerCliente,
  moverNegocio,
  quitarActividad,
  quitarContacto,
  quitarTarifa,
  recalcularCostoKm,
  responderCotizacion,
} from '../actions/ventas.actions';
import { ventasRepository } from '../repositories/ventas.repository';

const CLAVE = ['ventas'] as const;
const repo = () => ventasRepository(browserDb());

export const useTablero = () => useQuery({ queryKey: [...CLAVE, 'tablero'], queryFn: () => repo().tablero(), refetchInterval: 120_000 });
export const useEmpresas = (texto: string | null, solo: string | null) =>
  useQuery({ queryKey: [...CLAVE, 'empresas', texto, solo], queryFn: () => repo().empresas(texto, solo), placeholderData: keepPreviousData });
export const useEmpresa = (id: number | null) => useQuery({ queryKey: [...CLAVE, 'empresa', id], queryFn: () => repo().empresa(id!), enabled: !!id });
export const useTarifario = () => useQuery({ queryKey: [...CLAVE, 'tarifario'], queryFn: () => repo().tarifario() });
export const useSugerencia = (lineaId: number | null, empresaId: number | null, unidad: string, contenedor: string | null, vueltaVacia: boolean) =>
  useQuery({
    queryKey: [...CLAVE, 'sugerir', lineaId, empresaId, unidad, contenedor, vueltaVacia],
    queryFn: () => repo().sugerir(lineaId!, empresaId!, unidad, contenedor, vueltaVacia),
    enabled: !!lineaId && !!empresaId,
    staleTime: 60_000,
  });
export const useCotizaciones = (estado: string | null, texto: string | null) =>
  useQuery({ queryKey: [...CLAVE, 'cotizaciones', estado, texto], queryFn: () => repo().cotizaciones(estado, texto), placeholderData: keepPreviousData });
export const useCotizacion = (id: number | null) => useQuery({ queryKey: [...CLAVE, 'cotizacion', id], queryFn: () => repo().cotizacion(id!), enabled: !!id });
export const usePorFacturar = () => useQuery({ queryKey: [...CLAVE, 'por-facturar'], queryFn: () => repo().porFacturar() });
export const useFacturas = (estado: string | null) =>
  useQuery({ queryKey: [...CLAVE, 'facturas', estado], queryFn: () => repo().facturas(estado), placeholderData: keepPreviousData });
export const useFactura = (id: number | null) => useQuery({ queryKey: [...CLAVE, 'factura', id], queryFn: () => repo().factura(id!), enabled: !!id });

function useEscritura<I, T>(accion: (input: I) => Promise<ActionResult<T>>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: accion,
    // Migración 73: emitir o cobrar cambia también Finanzas
    onSuccess: (r) => (r.ok ? Promise.all([qc.invalidateQueries({ queryKey: CLAVE }), qc.invalidateQueries({ queryKey: ['finanzas'] })]) : undefined),
  });
}
export const useGuardarEmpresa = () => useEscritura(guardarEmpresa);
export const useGuardarContacto = () => useEscritura(guardarContacto);
export const useQuitarContacto = () => useEscritura(quitarContacto);
export const useGuardarNegocio = () => useEscritura(guardarNegocio);
export const useMoverNegocio = () => useEscritura(moverNegocio);
export const useGuardarActividad = () => useEscritura(guardarActividad);
export const useCompletarActividad = () => useEscritura(completarActividad);
export const useQuitarActividad = () => useEscritura(quitarActividad);
export const useHacerCliente = () => useEscritura(hacerCliente);
export const useGuardarTarifa = () => useEscritura(guardarTarifa);
export const useQuitarTarifa = () => useEscritura(quitarTarifa);
export const useGuardarAdicional = () => useEscritura(guardarAdicional);
export const useGuardarParametros = () => useEscritura(guardarParametros);
export const useRecalcularCostoKm = () => useEscritura(recalcularCostoKm);
export const useGuardarCotizacion = () => useEscritura(guardarCotizacion);
export const useEnviarCotizacion = () => useEscritura(enviarCotizacion);
export const useResponderCotizacion = () => useEscritura(responderCotizacion);
export const useAnularCotizacion = () => useEscritura(anularCotizacion);
export const useDuplicarCotizacion = () => useEscritura(duplicarCotizacion);
export const useCrearFactura = () => useEscritura(crearFactura);
export const useGuardarFactura = () => useEscritura(guardarFactura);
export const useEmitirFactura = () => useEscritura(emitirFactura);
export const useCobrarFactura = () => useEscritura(cobrarFactura);
export const useAnularFactura = () => useEscritura(anularFactura);
