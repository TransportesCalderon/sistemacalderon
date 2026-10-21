'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActionResult } from '@/server/actions/result';
import { browserDb } from '@/shared/supabase/browser';
import { cambiarUmbrales, comentarAlerta, reabrirAlerta, resolverAlerta, tomarAlerta } from '../actions/alerta.actions';
import type { Vista } from '../domain/alerta.types';
import { alertaRepository } from '../repositories/alerta.repository';

/** Alertas (migración 49). Después de cada acción se vuelve a leer la bandeja y Mis pendientes. */
export const useBandejaAlertas = (vista: Vista, desde: string | null, hasta: string | null) =>
  useQuery({
    queryKey: ['anomalias', 'bandeja', vista, desde, hasta] as const,
    queryFn: () => alertaRepository(browserDb()).bandeja(vista, desde, hasta),
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
      void qc.invalidateQueries({ queryKey: ['anomalias'] });
      void qc.invalidateQueries({ queryKey: ['pendientes'] });
    },
  });
}

export const useTomarAlerta = () => useEscritura(tomarAlerta);
export const useResolverAlerta = () => useEscritura(resolverAlerta);
export const useReabrirAlerta = () => useEscritura(reabrirAlerta);
export const useComentarAlerta = () => useEscritura(comentarAlerta);
export const useCambiarUmbrales = () => useEscritura(cambiarUmbrales);
