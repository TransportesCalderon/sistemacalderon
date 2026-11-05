'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActionResult } from '@/server/actions/result';
import { browserDb } from '@/shared/supabase/browser';
import {
  avanceAlerta,
  cambiarResponsableAlerta,
  cambiarUmbrales,
  comentarAlerta,
  marcarEscalamientoVisto,
  pedirProrrogaAlerta,
  reabrirAlerta,
  reasignarAlerta,
  resolverAlerta,
  resolverProrrogaAlerta,
  tomarAlerta,
} from '../actions/alerta.actions';
import type { FiltrosAlertas, Vista } from '../domain/alerta.types';
import { alertaRepository } from '../repositories/alerta.repository';
import { invalidar } from '@/shared/query/invalidar';

/** Alertas (migración 49). Después de cada acción se vuelve a leer la bandeja y Mis pendientes. */
export const useBandejaAlertas = (vista: Vista, desde: string | null, hasta: string | null, filtros?: FiltrosAlertas) =>
  useQuery({
    queryKey: ['anomalias', 'bandeja', vista, desde, hasta, filtros?.camionId ?? null, filtros?.severidad ?? null] as const,
    queryFn: () => alertaRepository(browserDb()).bandeja(vista, desde, hasta, filtros),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

export const useDetalleAlerta = (alertaId: number | null) =>
  useQuery({
    queryKey: ['anomalias', 'detalle', alertaId] as const,
    queryFn: () => alertaRepository(browserDb()).detalle(alertaId!),
    enabled: alertaId !== null,
    staleTime: 15_000,
  });

export const useReglasAlertas = () =>
  useQuery({ queryKey: ['anomalias', 'reglas'] as const, queryFn: () => alertaRepository(browserDb()).reglas(), staleTime: 60_000 });

function useEscritura<I, T>(accion: (input: I) => Promise<ActionResult<T>>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: accion,
    onSuccess: (r) => {
      if (!r.ok) return;
      void invalidar(qc, 'alerta');
    },
  });
}

export const useTomarAlerta = () => useEscritura(tomarAlerta);
export const useResolverAlerta = () => useEscritura(resolverAlerta);
export const useReabrirAlerta = () => useEscritura(reabrirAlerta);
export const useComentarAlerta = () => useEscritura(comentarAlerta);
export const useCambiarUmbrales = () => useEscritura(cambiarUmbrales);

// ---- Migraciones 188 y 189: gestión de alertas y carga imposible ----
export const useGestionAlertas = (ids: number[], activo: boolean) =>
  useQuery({
    queryKey: ['anomalias', 'gestion', ids] as const,
    queryFn: () => alertaRepository(browserDb()).gestiones(ids),
    enabled: activo && ids.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

export const useAvisosEscalamiento = (activo: boolean) =>
  useQuery({
    queryKey: ['anomalias', 'escalamiento'] as const,
    queryFn: () => alertaRepository(browserDb()).avisosEscalamiento(),
    enabled: activo,
    refetchInterval: activo ? 120_000 : false,
    staleTime: 60_000,
  });

export const useResponsablesAlertas = (activo: boolean) =>
  useQuery({ queryKey: ['anomalias', 'responsables'] as const, queryFn: () => alertaRepository(browserDb()).responsables(), enabled: activo, staleTime: 60_000 });

export const useResumenCargaImposible = (desde: string, hasta: string, activo: boolean) =>
  useQuery({
    queryKey: ['anomalias', 'carga-imposible', desde, hasta] as const,
    queryFn: () => alertaRepository(browserDb()).resumenCargaImposible(desde, hasta),
    enabled: activo,
    staleTime: 60_000,
  });

export const useAvanceAlerta = () => useEscritura(avanceAlerta);
export const useReasignarAlerta = () => useEscritura(reasignarAlerta);
export const usePedirProrrogaAlerta = () => useEscritura(pedirProrrogaAlerta);
export const useResolverProrrogaAlerta = () => useEscritura(resolverProrrogaAlerta);
export const useEscalamientoVisto = () => useEscritura(marcarEscalamientoVisto);
export const useCambiarResponsableAlerta = () => useEscritura(cambiarResponsableAlerta);
