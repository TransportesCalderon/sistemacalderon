'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { REFRESCO } from '@/shared/query/frescura';
import { browserDb } from '@/shared/supabase/browser';
import { importarTelemetriaAhora } from '../actions/flota.actions';
import { buscarEquiposTrackerway, enlazarEquipoTrackerway, importarEquipoTrackerway } from '../actions/trackerway.actions';
import type { ZonaMapa } from '../domain/clima.types';
import { conduccionRepository } from '../repositories/conduccion.repository';
import { flotaRepository } from '../repositories/flota.repository';
import { tableroRepository } from '../repositories/tablero.repository';
import { trackerwayRepository } from '../repositories/trackerway.repository';
import { seguimientoRepository } from '../repositories/seguimiento.repository';
import { pedirCarga, registrarSeguimiento, registrarSeguimientoFoto } from '../actions/seguimiento.actions';
import { telemetriaQueries as q } from './keys';
import { invalidar } from '@/shared/query/invalidar';

export const useFlotaEnVivo = () => useQuery({ ...q.enVivo(browserDb()), staleTime: REFRESCO.mapa, refetchInterval: REFRESCO.mapa });
/** Migración 84: estela y ficha de cada camión (cada 30 segundos). */
export const useMapaFlota = (minutos: number) => useQuery({ ...q.mapa(browserDb(), minutos), refetchInterval: REFRESCO.telemetriaVivo });
export const useVehiculosApi = () => useQuery(q.vehiculosApi(browserDb()));
export const useCorridasApi = (enabled: boolean) =>
  useQuery({ ...q.corridas(browserDb()), enabled, refetchInterval: REFRESCO.telemetriaVivo });

export function useImportarAhora() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: importarTelemetriaAhora,
    onSuccess: () => invalidar(qc, 'telemetria'),
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
  return useMutation({ mutationFn: fn, onSuccess: () => invalidar(qc, 'telemetria') });
}
export const useBuscarEquiposTrackerway = () => useCambioTrackerway(buscarEquiposTrackerway);
export const useEnlazarEquipoTrackerway = () => useCambioTrackerway(enlazarEquipoTrackerway);
export const useImportarEquipoTrackerway = () => useCambioTrackerway(importarEquipoTrackerway);

/** Migración 89: litros que faltaban para llenar el camión a esa fecha y hora (sin fecha, ahora). */
export const useLitrosSugeridos = (camionId: number | null, fechaHora: string | null) =>
  useQuery({
    queryKey: ['telemetria', 'sugeridos', camionId, fechaHora] as const,
    queryFn: () => tableroRepository(browserDb()).sugeridos(camionId as number, fechaHora),
    enabled: camionId !== null,
    staleTime: 60_000,
  });

/** Migración 89: camiones que llegaron a una estación (últimas horas), para la oficina. */
export const useAvisosCarga = (horas = 12) =>
  useQuery({
    queryKey: ['telemetria', 'avisos-carga', horas] as const,
    queryFn: () => tableroRepository(browserDb()).avisos(horas),
    refetchInterval: 120_000,
  });

/** Migración 182: clima de la zona del mapa (se pide solo con una capa prendida; la base lo guarda 60 min). */
export const useClimaMapa = (zona: ZonaMapa | null) =>
  useQuery({
    queryKey: ['telemetria', 'clima', zona],
    queryFn: () => flotaRepository(browserDb()).clima(zona!),
    enabled: zona !== null,
    staleTime: 10 * 60_000,
    refetchInterval: 30 * 60_000,
    placeholderData: keepPreviousData,
  });

// ---- Migración 194: seguimiento de los viajes en curso ----
export const useViajesEnCurso = (activo: boolean) =>
  useQuery({
    queryKey: ['telemetria', 'seguimiento'] as const,
    queryFn: () => seguimientoRepository(browserDb()).viajes(),
    enabled: activo,
    placeholderData: keepPreviousData,
    refetchInterval: activo ? 5 * 60_000 : false,
  });
export const useControlesViaje = (viajeId: number | null) =>
  useQuery({
    queryKey: ['telemetria', 'seguimiento', 'controles', viajeId] as const,
    queryFn: () => seguimientoRepository(browserDb()).controles(viajeId!),
    enabled: viajeId !== null,
  });
/** Migración 197: el viaje medido desde el momento elegido (null = no consulta; se usa la lista). */
export const useSeguimientoDesde = (viajeId: number, desde: string | null) =>
  useQuery({
    queryKey: ['telemetria', 'seguimiento', 'desde', viajeId, desde] as const,
    queryFn: () => seguimientoRepository(browserDb()).desde(viajeId, desde!),
    enabled: desde !== null,
    retry: false,
  });
export function useRegistrarSeguimiento() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: registrarSeguimiento, onSuccess: (r) => (r.ok ? invalidar(qc, 'telemetria') : undefined) });
}
/** Migración 240: con la foto de la computadora de a bordo. */
export function useRegistrarSeguimientoFoto() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: registrarSeguimientoFoto, onSuccess: (r) => (r.ok ? invalidar(qc, 'telemetria') : undefined) });
}

// ---- Migración 195: pedido de carga ----
export const useDatosPedidoCarga = (viajeId: number, estacionId: number | null) =>
  useQuery({
    queryKey: ['telemetria', 'pedido-carga', viajeId, estacionId] as const,
    queryFn: () => seguimientoRepository(browserDb()).datosPedido(viajeId, estacionId),
    placeholderData: keepPreviousData,
  });
export const usePedidosCarga = (viajeId: number | null) =>
  useQuery({
    queryKey: ['telemetria', 'pedidos-carga', viajeId] as const,
    queryFn: () => seguimientoRepository(browserDb()).pedidos(viajeId!),
    enabled: viajeId !== null,
  });
export function usePedirCarga() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: pedirCarga, onSuccess: (r) => (r.ok ? invalidar(qc, 'telemetria') : undefined) });
}
