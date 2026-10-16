'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { browserDb } from '@/shared/supabase/browser';
import {
  crearTipoCambio,
  eliminarEstacion,
  eliminarProveedor,
  eliminarTipoCambio,
  guardarEstacion,
  guardarParametro,
  guardarProveedor,
} from '../actions/catalogos.actions';
import { catalogosQueries } from './keys';

export const usePaises = () => useQuery(catalogosQueries.paises(browserDb()));
export const useMonedas = () => useQuery(catalogosQueries.monedas(browserDb()));
export const useProveedores = () => useQuery(catalogosQueries.proveedores(browserDb()));
export const useEstaciones = () => useQuery(catalogosQueries.estaciones(browserDb()));
export const useTiposCambio = (moneda?: string) => useQuery({ ...catalogosQueries.tiposCambio(browserDb(), moneda), placeholderData: keepPreviousData });
export const useParametros = () => useQuery(catalogosQueries.parametros(browserDb()));

/**
 * Toda escritura de catálogos vuelve a leer los catálogos y también Combustible y Flota,
 * que los usan en sus formularios (estaciones de la carga, monedas…).
 */
function useEscritura<I, R extends { ok: boolean }>(accion: (input: I) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: accion,
    onSuccess: async (r) => {
      if (!r.ok) return;
      await Promise.all([
        qc.invalidateQueries({ queryKey: catalogosQueries.todo() }),
        qc.invalidateQueries({ queryKey: ['combustible'] }),
        qc.invalidateQueries({ queryKey: ['flota'] }),
      ]);
    },
  });
}

export const useGuardarProveedor = () => useEscritura(guardarProveedor);
export const useEliminarProveedor = () => useEscritura(eliminarProveedor);
export const useGuardarEstacion = () => useEscritura(guardarEstacion);
export const useEliminarEstacion = () => useEscritura(eliminarEstacion);
export const useCrearTipoCambio = () => useEscritura(crearTipoCambio);
export const useEliminarTipoCambio = () => useEscritura(eliminarTipoCambio);
export const useGuardarParametro = () => useEscritura(guardarParametro);
