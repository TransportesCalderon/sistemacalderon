'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { browserDb } from '@/shared/supabase/browser';
import { invalidar } from '@/shared/query/invalidar';
import { anularOrdenCarga, aprobarSolicitudCarga, crearOrdenCarga, rechazarSolicitudCarga, crearOrdenGenset, registrarCargaOrden, guardarCorreoEstacion, revisarOrdenCarga, terminarOrdenCarga, terminarOrdenCargaOficina, informarCargaTarjeta, noCargueOrden } from '../actions/orden-carga.actions';
import { ordenCargaRepository } from '../repositories/orden-carga.repository';

/** Migración 234 · Órdenes de carga de combustible. */
const repo = () => ordenCargaRepository(browserDb());

export const useOrdenesCarga = (activo: boolean) =>
  useQuery({ queryKey: ['combustible', 'ordenes', 'lista'] as const, queryFn: () => repo().lista(30), enabled: activo, refetchInterval: activo ? 30_000 : false });

export const usePrepararOrden = (camionId: number | null, estacionId: number | null) =>
  useQuery({
    queryKey: ['combustible', 'ordenes', 'preparar', camionId, estacionId] as const,
    queryFn: () => repo().preparar(camionId!, estacionId),
    enabled: camionId !== null,
  });

export const useMisOrdenesCarga = (activo: boolean) =>
  useQuery({ queryKey: ['chofer', 'ordenes-carga'] as const, queryFn: () => repo().misOrdenes(), enabled: activo, refetchInterval: activo ? 15_000 : false });

function useAccion<A, R>(accion: (a: A) => Promise<R>, objeto: 'combustible' | 'chofer_portal' | 'catalogo') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: accion,
    onSuccess: async (r) => {
      if ((r as { ok?: boolean }).ok === false) return;
      await invalidar(qc, objeto);
    },
  });
}

export const useCrearOrdenCarga = () => useAccion(crearOrdenCarga, 'combustible');
// Migración 253: cargas de órdenes terminadas, para dar el OK
export const usePorRegistrar = (activo: boolean) =>
  useQuery({ queryKey: ['combustible', 'ordenes', 'por-registrar'] as const, queryFn: () => repo().porRegistrar(), enabled: activo, refetchInterval: activo ? 60_000 : false });
export const useRegistrarCargaOrden = () => useAccion(registrarCargaOrden, 'combustible');
// Migración 252: gensets
export const useCrearOrdenGenset = () => useAccion(crearOrdenGenset, 'combustible');
export const useGensetsOrden = (activo: boolean) =>
  useQuery({ queryKey: ['combustible', 'ordenes', 'gensets'] as const, queryFn: () => repo().gensets(), enabled: activo, staleTime: 60_000 });
export const usePrepararGenset = (gensetId: number | null, estacionId: number | null) =>
  useQuery({
    queryKey: ['combustible', 'ordenes', 'preparar-genset', gensetId, estacionId] as const,
    queryFn: () => repo().prepararGenset(gensetId!, estacionId),
    enabled: gensetId !== null,
  });
export const useAnularOrdenCarga = () => useAccion(anularOrdenCarga, 'combustible');
export const useRevisarOrdenCarga = () => useAccion(revisarOrdenCarga, 'combustible');
export const useCorreoEstacion = () => useAccion(guardarCorreoEstacion, 'catalogo');
export const useTerminarOrdenCarga = () => useAccion(terminarOrdenCarga, 'chofer_portal');
export const useTerminarOrdenCargaOficina = () => useAccion(terminarOrdenCargaOficina, 'combustible');
// Migración 304: Chile, la carga con tarjeta de flota que avisa el chofer
export const useOpcionesCargaTarjeta = (activo: boolean) =>
  useQuery({ queryKey: ['chofer', 'carga-tarjeta'] as const, queryFn: () => repo().opcionesCargaTarjeta(), enabled: activo, staleTime: 60_000 });
export const useInformarCargaTarjeta = () => useAccion(informarCargaTarjeta, 'chofer_portal');
// Cambio 360: órdenes de Chile vencidas sin ticket (oficina) y «No cargué» (chofer)
export const useVencidasSinTicket = (activo: boolean) =>
  useQuery({ queryKey: ['combustible', 'ordenes', 'vencidas-sin-ticket'] as const, queryFn: () => repo().vencidasSinTicket(), enabled: activo, refetchInterval: activo ? 60_000 : false });
export const useNoCargueOrden = () => useAccion(noCargueOrden, 'chofer_portal');
// Migración 259: solicitudes de carga pedidas desde Seguimiento de viaje
export const useSolicitudesCarga = (activo: boolean) =>
  useQuery({ queryKey: ['combustible', 'ordenes', 'solicitudes'] as const, queryFn: () => repo().solicitudes(), enabled: activo, refetchInterval: activo ? 30_000 : false });
export const useAprobarSolicitudCarga = () => useAccion(aprobarSolicitudCarga, 'combustible');
export const useRechazarSolicitudCarga = () => useAccion(rechazarSolicitudCarga, 'combustible');
