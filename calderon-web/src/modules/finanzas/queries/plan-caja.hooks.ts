'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActionResult } from '@/server/actions/result';
import { browserDb } from '@/shared/supabase/browser';
import { invalidar } from '@/shared/query/invalidar';
import { ajustarPlanCaja, cerrarPartidaCaja, guardarMoraCaja, guardarPartidaCaja, guardarReglasReparto } from '../actions/plan-caja.actions';
import type { OpcionesPlan } from '../domain/plan-caja';
import type { OpcionesReparto } from '../domain/reparto-caja';
import { planCajaRepository } from '../repositories/plan-caja.repository';

/**
 * Migración 367 · Planificador de caja. La clave empieza con «finanzas»: el plan se vuelve a armar con cualquier
 * guardado de Finanzas (un cobro, un pago, un gasto nuevo). Mientras llega el plan con otras opciones, se sigue
 * viendo el anterior.
 */
export const usePlanCaja = (opciones: OpcionesPlan) =>
  useQuery({
    queryKey: ['finanzas', 'plan-caja', opciones],
    queryFn: () => planCajaRepository(browserDb()).leer(opciones),
    placeholderData: keepPreviousData,
  });

function useEscritura<I, T>(accion: (input: I) => Promise<ActionResult<T>>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: accion, onSuccess: (r) => (r.ok ? invalidar(qc, 'finanzas') : undefined) });
}
export const useAjustarPlanCaja = () => useEscritura(ajustarPlanCaja);
export const useGuardarPartidaCaja = () => useEscritura(guardarPartidaCaja);
export const useCerrarPartidaCaja = () => useEscritura(cerrarPartidaCaja);

/** Migración 368 · «¿Qué hacemos con la plata?». Se vuelve a armar con cualquier guardado de Finanzas. */
export const useRepartoCaja = (opciones: OpcionesReparto) =>
  useQuery({
    queryKey: ['finanzas', 'plan-caja', 'reparto', opciones],
    queryFn: () => planCajaRepository(browserDb()).reparto(opciones),
    placeholderData: keepPreviousData,
  });
export const useGuardarReglasReparto = () => useEscritura(guardarReglasReparto);
export const useGuardarMoraCaja = () => useEscritura(guardarMoraCaja);
