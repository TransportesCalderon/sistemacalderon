'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActionResult } from '@/server/actions/result';
import { browserDb } from '@/shared/supabase/browser';
import {
  adjuntarFirmada,
  agregarRenglon,
  guardarEmpresa,
  guardarFicha,
  guardarIndicadores,
  guardarLegal,
  anularLiquidacion,
  aprobarLiquidacion,
  guardarConcepto,
  guardarTarifa,
  pagarLiquidacion,
  prepararLiquidacion,
  prepararLiquidaciones,
  quitarRenglon,
  quitarTarifa,
  reabrirLiquidacion,
} from '../actions/liquidacion.actions';
import { liquidacionRepository } from '../repositories/liquidacion.repository';
import { invalidar } from '@/shared/query/invalidar';

const CLAVE = ['liquidacion'] as const;
const repo = () => liquidacionRepository(browserDb());

export const usePeriodoLiquidaciones = (periodo: string | null) =>
  useQuery({
    queryKey: [...CLAVE, 'periodo', periodo],
    queryFn: () => repo().periodo(periodo!),
    enabled: !!periodo,
    placeholderData: keepPreviousData,
  });
export const useLiquidacion = (id: number | null) =>
  useQuery({ queryKey: [...CLAVE, 'ficha', id], queryFn: () => repo().liquidacion(id!), enabled: !!id });
export const useMisLiquidaciones = () => useQuery({ queryKey: [...CLAVE, 'mias'], queryFn: () => repo().mias() });
export const useTarifas = () => useQuery({ queryKey: [...CLAVE, 'tarifas'], queryFn: () => repo().tarifas() });
export const useConceptos = () => useQuery({ queryKey: [...CLAVE, 'conceptos'], queryFn: () => repo().conceptos() });
export const useDatosLegales = (activo = true) =>
  useQuery({ queryKey: [...CLAVE, 'datos-legales'], queryFn: () => repo().datosLegales(), enabled: activo });

function useEscritura<I, T>(accion: (input: I) => Promise<ActionResult<T>>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: accion,
    onSuccess: (r) => (r.ok ? invalidar(qc, 'liquidacion') : undefined),
  });
}
export const useGuardarTarifa = () => useEscritura(guardarTarifa);
export const useQuitarTarifa = () => useEscritura(quitarTarifa);
export const useGuardarConcepto = () => useEscritura(guardarConcepto);
export const usePrepararLiquidacion = () => useEscritura(prepararLiquidacion);
export const usePrepararLiquidaciones = () => useEscritura(prepararLiquidaciones);
export const useAgregarRenglon = () => useEscritura(agregarRenglon);
export const useQuitarRenglon = () => useEscritura(quitarRenglon);
export const useAprobarLiquidacion = () => useEscritura(aprobarLiquidacion);
export const usePagarLiquidacion = () => useEscritura(pagarLiquidacion);
export const useReabrirLiquidacion = () => useEscritura(reabrirLiquidacion);
export const useAnularLiquidacion = () => useEscritura(anularLiquidacion);
export const useGuardarEmpresa = () => useEscritura(guardarEmpresa);
export const useGuardarIndicadores = () => useEscritura(guardarIndicadores);
export const useGuardarFicha = () => useEscritura(guardarFicha);
export const useGuardarLegal = () => useEscritura(guardarLegal);
export const useAdjuntarFirmada = () => useEscritura(adjuntarFirmada);
