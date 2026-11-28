'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { REFRESCO } from '@/shared/query/frescura';
import { invalidar } from '@/shared/query/invalidar';
import { browserDb } from '@/shared/supabase/browser';
import { anularHabilitacionHorario, habilitarFueraHorario, labrarActaFueraHorario, sinSancionFueraHorario } from '../actions/horario.actions';
import { horarioRepository } from '../repositories/horario.repository';

/** Migración 286 · Horario de manejo: quién circula fuera de horario y quién está habilitado (cada minuto). */
export const useFueraHorario = (enabled: boolean) =>
  useQuery({
    queryKey: ['telemetria', 'fuera-horario'] as const,
    queryFn: () => horarioRepository(browserDb()).fueraHorario(),
    enabled,
    refetchInterval: REFRESCO.bandeja,
  });

export function useHabilitarFueraHorario() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: habilitarFueraHorario, onSuccess: (r) => (r.ok ? invalidar(qc, 'telemetria') : undefined) });
}

/** Migración 389 */
export function useLabrarActaFueraHorario() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: labrarActaFueraHorario, onSuccess: (r) => (r.ok ? (invalidar(qc, 'telemetria'), invalidar(qc, 'acta')) : undefined) });
}
export function useSinSancionFueraHorario() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: sinSancionFueraHorario, onSuccess: (r) => (r.ok ? invalidar(qc, 'telemetria') : undefined) });
}

export function useAnularHabilitacionHorario() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: anularHabilitacionHorario, onSuccess: (r) => (r.ok ? invalidar(qc, 'telemetria') : undefined) });
}
