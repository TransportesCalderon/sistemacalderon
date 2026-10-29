'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { browserDb } from '@/shared/supabase/browser';
import {
  actualizarCotizaciones,
  crearTipoCambio,
  definirMonedaBase,
  eliminarEstacion,
  eliminarProveedor,
  eliminarTipoCambio,
  eliminarUbicacion,
  guardarEstacion,
  guardarParametro,
  guardarTipoCarga,
  guardarProveedor,
  guardarUbicacion,
} from '../actions/catalogos.actions';
import { catalogosQueries } from './keys';
import { invalidar } from '@/shared/query/invalidar';

export const usePaises = () => useQuery(catalogosQueries.paises(browserDb()));
export const useMonedas = () => useQuery(catalogosQueries.monedas(browserDb()));
export const useProveedores = () => useQuery(catalogosQueries.proveedores(browserDb()));
export const useEstaciones = () => useQuery(catalogosQueries.estaciones(browserDb()));
export const useTiposCambio = (moneda?: string) => useQuery({ ...catalogosQueries.tiposCambio(browserDb(), moneda), placeholderData: keepPreviousData });
export const useParametros = () => useQuery(catalogosQueries.parametros(browserDb()));
export const useUbicaciones = () => useQuery(catalogosQueries.ubicaciones(browserDb()));
export const useImportaciones = () => useQuery(catalogosQueries.importaciones(browserDb()));
/** Migración 121: solo se pide si la base ya tiene la lista de tipos de carga. */
export const useTiposCarga = (activo = true) => useQuery({ ...catalogosQueries.tiposCarga(browserDb()), enabled: activo });

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
      await invalidar(qc, 'catalogo');
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
export const useActualizarCotizaciones = () => useEscritura(actualizarCotizaciones);
export const useDefinirMonedaBase = () => useEscritura(definirMonedaBase);
export const useGuardarUbicacion = () => useEscritura(guardarUbicacion);
export const useEliminarUbicacion = () => useEscritura(eliminarUbicacion);
export const useGuardarTipoCarga = () => useEscritura(guardarTipoCarga);
