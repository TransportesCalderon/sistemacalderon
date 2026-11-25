'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActionResult } from '@/server/actions/result';
import { browserDb } from '@/shared/supabase/browser';
import {
  guardarBonoColaboradores,
  guardarBonoDesempeno,
  guardarDiaTrabajado,
  guardarDiaTrabajadoFlota,
  quitarBonoColaboradores,
  guardarTramoLiquidacion,
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
  choferesAPreparar,
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
/** Liquidación en 3 pasos: días trabajados de un chofer en un período de liquidación (también desde Flota). */
export const useDiasTrabajados = (choferId: number | null, periodo: string | null) =>
  useQuery({
    queryKey: [...CLAVE, 'dias', choferId, periodo],
    queryFn: () => repo().diasTrabajados(choferId!, periodo!),
    enabled: !!choferId && !!periodo,
    placeholderData: keepPreviousData,
  });
export const useNovedades = () => useMutation({ mutationFn: (periodo: string) => repo().novedades(periodo) });
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
/**
 * «Preparar todas»: pide la lista de choferes y prepara de a uno (todas en un solo pedido
 * superaban el tiempo máximo). Si la base todavía no tiene la lista (migración 20261125100000),
 * usa el pedido único de antes.
 */
export function usePrepararLiquidaciones(alAvanzar?: (hechas: number, total: number) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ periodo }: { periodo: string }): Promise<ActionResult<{ preparadas: number; errores: { chofer: string; error: string }[] }>> => {
      const lista = await choferesAPreparar({ periodo });
      if (!lista.ok) return lista.error.codigo === 'sin_permiso' ? lista : prepararLiquidaciones({ periodo });
      let preparadas = 0;
      const errores: { chofer: string; error: string }[] = [];
      alAvanzar?.(0, lista.data.length);
      for (const [i, ch] of lista.data.entries()) {
        const r = await prepararLiquidacion({ choferId: ch.id, periodo });
        if (r.ok) preparadas++;
        else errores.push({ chofer: ch.nombre, error: r.error.mensaje });
        alAvanzar?.(i + 1, lista.data.length);
      }
      return { ok: true, data: { preparadas, errores } };
    },
    onSettled: () => invalidar(qc, 'liquidacion'),
  });
}
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
export const useGuardarDiaTrabajado = (desdeFlota = false) => useEscritura(desdeFlota ? guardarDiaTrabajadoFlota : guardarDiaTrabajado);
export const useGuardarBonoDesempeno = () => useEscritura(guardarBonoDesempeno);
export const useGuardarBonoColaboradores = () => useEscritura(guardarBonoColaboradores);
export const useQuitarBonoColaboradores = () => useEscritura(quitarBonoColaboradores);
export const useGuardarTramo = () => useEscritura(guardarTramoLiquidacion);
