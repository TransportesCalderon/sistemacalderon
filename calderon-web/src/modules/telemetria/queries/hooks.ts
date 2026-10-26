'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { REFRESCO } from '@/shared/query/frescura';
import { browserDb } from '@/shared/supabase/browser';
import { importarTelemetriaAhora } from '../actions/flota.actions';
import { buscarEquiposTrackerway, enlazarEquipoTrackerway, importarEquipoTrackerway } from '../actions/trackerway.actions';
import { conduccionRepository } from '../repositories/conduccion.repository';
import { trackerwayRepository } from '../repositories/trackerway.repository';
import { telemetriaQueries as q } from './keys';

export const useFlotaEnVivo = () => useQuery({ ...q.enVivo(browserDb()), staleTime: REFRESCO.mapa, refetchInterval: REFRESCO.mapa });
export const useVehiculosApi = () => useQuery(q.vehiculosApi(browserDb()));
export const useCorridasApi = (enabled: boolean) =>
  useQuery({ ...q.corridas(browserDb()), enabled, refetchInterval: REFRESCO.telemetriaVivo });

export function useImportarAhora() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: importarTelemetriaAhora,
    onSuccess: () => qc.invalidateQueries({ queryKey: q.todo() }),
  });
}

// Migración 49: conducción por chofer y calidad de los datos
export const usePuntajesChoferes = (desde: string, hasta: string) =>
  useQuery({
    queryKey: ['telemetria', 'puntajes', desde, hasta] as const,
    queryFn: () => conduccionRepository(browserDb()).puntajes(desde, hasta),
    staleTime: 60_000,
  });
export const useDiasChofer = (choferId: number | null, desde: string, hasta: string) =>
  useQuery({
    queryKey: ['telemetria', 'dias-chofer', choferId, desde, hasta] as const,
    queryFn: () => conduccionRepository(browserDb()).diasChofer(choferId!, desde, hasta),
    enabled: choferId !== null,
    staleTime: 60_000,
  });
export const useInventarioTelemetria = (dias: number) =>
  useQuery({ queryKey: ['telemetria', 'inventario', dias] as const, queryFn: () => conduccionRepository(browserDb()).inventario(dias), staleTime: 300_000 });
export const useTarjetasSinEnlace = (dias: number) =>
  useQuery({ queryKey: ['telemetria', 'sin-enlace', dias] as const, queryFn: () => conduccionRepository(browserDb()).sinEnlace(dias), staleTime: 300_000 });
export const useProgramadorTelemetria = (camionId: number, desde: string, hasta: string, enabled: boolean) =>
  useQuery({
    queryKey: ['telemetria', 'programador', camionId, desde, hasta] as const,
    queryFn: () => conduccionRepository(browserDb()).programadorPct(camionId, desde, hasta),
    enabled,
    staleTime: 300_000,
  });

// Migración 72: equipos GPS de Trackerway
export const usePanelTrackerway = () =>
  useQuery({ queryKey: ['telemetria', 'trackerway'] as const, queryFn: () => trackerwayRepository(browserDb()).panel(), staleTime: 30_000 });

function useCambioTrackerway<A, R>(fn: (a: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: q.todo() }) });
}
export const useBuscarEquiposTrackerway = () => useCambioTrackerway(buscarEquiposTrackerway);
export const useEnlazarEquipoTrackerway = () => useCambioTrackerway(enlazarEquipoTrackerway);
export const useImportarEquipoTrackerway = () => useCambioTrackerway(importarEquipoTrackerway);
