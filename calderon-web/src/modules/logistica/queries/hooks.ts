'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { browserDb } from '@/shared/supabase/browser';
import { agregarGastoViaje, anularGastoViaje } from '../actions/costos.actions';
import { marcarDesvioVisto, marcarTanqueBajoVisto } from '../actions/rutas.actions';
import { costosRepository } from '../repositories/costos.repository';
import { usePizarraEnVivo } from '@/modules/pizarra/queries/hooks';
import {
  asignarViaje,
  asignarVueltaVacia,
  cambiarChofer,
  cancelarViaje,
  modificarViaje,
  pasoViaje,
  reprogramarDescarga,
} from '../actions/viajes.actions';
import {
  altaOperaciones,
  anularHito,
  avanzarOperacion,
  asignarEquipo,
  asignarGenset,
  asignarTercero,
  cancelarOperacion,
  confirmarOperacion,
  dejarEnBase,
  eliminarLinea,
  eliminarTransportista,
  guardarLinea,
  guardarAgenteTransporte,
  guardarOperacion,
  guardarTransportista,
  quitarEquipo,
  registrarHito,
  seguirConOtroTractor,
  cambiarTractorEnRuta,
  pasarAFletero,
  marcarConforme,
  terminarDemora,
  volverPaso,
} from '../actions/operaciones.actions';
import { operacionesRepository } from '../repositories/operaciones.repository';
import { viajesChoferRepository } from '../repositories/viajes-chofer.repository';
import {
  agregarItemViaje,
  ajustarItemViaje,
  anularViajeChofer,
  asignarTractor,
  cambiarChoferViaje,
  cerrarViajeChofer,
  cerrarYAprobarViaje,
  continuarOperacionViaje,
  iniciarViajeChofer,
  prepararCierreCombustible,
  quitarItemViaje,
  reabrirViajeChofer,
} from '../actions/viajes-chofer.actions';
import type { FechaDia } from '@/shared/types/dominio';
import { logisticaQueries as q } from './keys';
import { invalidar } from '@/shared/query/invalidar';

export const useViajesAbiertos = () => useQuery({ ...q.abiertos(browserDb()), refetchInterval: 60_000 });
export const useOpcionesViaje = () => useQuery(q.opciones(browserDb()));
export const useOperaciones = (desde: FechaDia | null, hasta: FechaDia | null) =>
  useQuery({ ...q.operaciones(browserDb(), desde, hasta), refetchInterval: 60_000 });
export const useSugerenciaCliente = (cliente: number | null) =>
  useQuery({ ...q.sugerencia(browserDb(), cliente ?? 0), enabled: !!cliente });
export const useLineas = () => useQuery(q.lineas(browserDb()));
export const useAgentesTransporte = (todos = false) => useQuery(q.agentes(browserDb(), todos));
export const useRutaOperacion = (servicio: number) => useQuery(q.rutaOperacion(browserDb(), servicio));
/** Migración 161: tabla de choferes (cada minuto) y la fila de rutas de un chofer. */
export const useRutasChoferes = (activo = true) => useQuery({ ...q.rutasChoferes(browserDb()), enabled: activo, refetchInterval: 60_000 });
export const useRutasDeChofer = (chofer: number) => useQuery({ ...q.rutasDeChofer(browserDb(), chofer), refetchInterval: 60_000 });
/** Migración 158: todas las rutas de la operación (cada minuto: el GPS puede pasar a la siguiente). */
export const useRutasTramo = (servicio: number, activo = true) =>
  useQuery({ ...q.rutasTramo(browserDb(), servicio), enabled: activo, refetchInterval: 60_000 });
/** Migración 156: pantalla «Rutas para choferes» (cada minuto, para ver los desvíos). */
export const useRutasOperaciones = () => useQuery({ ...q.rutasOperaciones(browserDb()), refetchInterval: 60_000 });
/** Migración 156: ventana emergente de desvíos (cada minuto). */
export const useAvisosDesvio = (activo: boolean) =>
  useQuery({ ...q.avisosDesvio(browserDb()), enabled: activo, refetchInterval: activo ? 60_000 : false });
export function useDesvioVisto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: marcarDesvioVisto,
    onSuccess: (r) => (r.ok ? invalidar(qc, 'desvio') : undefined),
  });
}
/** Migración 177: ventana emergente de tanque bajo (cada minuto). */
export const useAvisosTanqueBajo = (activo: boolean) =>
  useQuery({ ...q.avisosTanqueBajo(browserDb()), enabled: activo, refetchInterval: activo ? 60_000 : false });
export function useTanqueBajoVisto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: marcarTanqueBajoVisto,
    onSuccess: (r) => (r.ok ? invalidar(qc, 'tanque_bajo') : undefined),
  });
}
export const useTramosOperacion = (servicio: number) => useQuery(q.tramos(browserDb(), servicio));
export const useOperacion = (servicio: number) => useQuery(q.operacion(browserDb(), servicio));
/** Migración 166: el precio del viaje (al modificar o duplicar). */
export const usePrecioOperacion = (servicio: number | null, activo: boolean) =>
  useQuery({ ...q.precioOperacion(browserDb(), servicio ?? 0), enabled: activo && !!servicio });
export const useTransportistas = () => useQuery(q.transportistas(browserDb()));

/** El mismo aviso de tiempo real de la Pizarra («cambió la pizarra») refresca también la lista de Logística. */
export const useViajesEnVivo = () => usePizarraEnVivo('viajes_en_vivo');

function useEscritura<I, R extends { ok: boolean }>(accion: (input: I) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: accion,
    onSuccess: async (r) => {
      if (!r.ok) return;
      await invalidar(qc, 'operacion');
    },
  });
}

export const useAsignarViaje = () => useEscritura(asignarViaje);
export const useAsignarVueltaVacia = () => useEscritura(asignarVueltaVacia);
export const useModificarViaje = () => useEscritura(modificarViaje);
export const useReprogramarDescarga = () => useEscritura(reprogramarDescarga);
export const useCambiarChofer = () => useEscritura(cambiarChofer);
export const useCancelarViaje = () => useEscritura(cancelarViaje);
export const usePasoViaje = () => useEscritura(pasoViaje);

export const useGuardarOperacion = () => useEscritura(guardarOperacion);
export const useConfirmarOperacion = () => useEscritura(confirmarOperacion);
export const useAsignarEquipo = () => useEscritura(asignarEquipo);
export const useQuitarEquipo = () => useEscritura(quitarEquipo);
export const useAsignarTercero = () => useEscritura(asignarTercero);
export const useRegistrarHito = () => useEscritura(registrarHito);
export const useTerminarDemora = () => useEscritura(terminarDemora);
export const useAnularHito = () => useEscritura(anularHito);
export const useCancelarOperacion = () => useEscritura(cancelarOperacion);
// Migración 101
export const useVolverPaso = () => useEscritura(volverPaso);
export const useAsignarGenset = () => useEscritura(asignarGenset);
export const useGensetsOperacion = (servicio: number, enabled = true) =>
  useQuery({
    queryKey: ['logistica', 'gensets', servicio] as const,
    queryFn: () => operacionesRepository(browserDb()).gensets(servicio),
    enabled,
    staleTime: 0,
  });
export const useGuardarLinea = () => useEscritura(guardarLinea);
export const useGuardarAgente = () => useEscritura(guardarAgenteTransporte);
export const useEliminarLinea = () => useEscritura(eliminarLinea);
export const useGuardarTransportista = () => useEscritura(guardarTransportista);
export const useEliminarTransportista = () => useEscritura(eliminarTransportista);
export const useAltaOperaciones = () => useEscritura(altaOperaciones);
export const useAvanzarOperacion = () => useEscritura(avanzarOperacion);
// Migración 125: cambio de tractor en la base operativa
export const useDejarEnBase = () => useEscritura(dejarEnBase);
export const useSeguirConOtroTractor = () => useEscritura(seguirConOtroTractor);
export const useCambiarTractorEnRuta = () => useEscritura(cambiarTractorEnRuta);
export const usePasarAFletero = () => useEscritura(pasarAFletero);
/** Migración 176: el conforme de descarga (se ve en Operaciones y en Facturación). */
export function useMarcarConforme() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: marcarConforme,
    onSuccess: async (r) => {
      if (!r.ok) return;
      await Promise.all([invalidar(qc, 'operacion'), invalidar(qc, 'venta')]);
    },
  });
}
/** Migración 176: el chofer asignado a un tractor (para proponerlo en un relevo). */
export const useChoferDeTractor = (camionId: number | null) =>
  useQuery({
    queryKey: ['logistica', 'chofer-de-tractor', camionId] as const,
    enabled: !!camionId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await browserDb().schema('mae').rpc('fn_chofer_de_tractor', { p_camion: camionId ?? 0 });
      if (error) throw error;
      return (data ?? null) as number | null;
    },
  });
export const useBasesOperativas = (activo = true) =>
  useQuery({ queryKey: ['logistica', 'bases-operativas'] as const, queryFn: () => operacionesRepository(browserDb()).basesOperativas(), enabled: activo, staleTime: 300_000 });

// Migración 46: tractores y viajes de chofer
export const useTractores = () => useQuery({ ...q.tractores(browserDb()), refetchInterval: 60_000 });
export const useViajesChofer = (desde: FechaDia | null, hasta: FechaDia | null) => useQuery(q.viajesChofer(browserDb(), desde, hasta));
export const useViajeChofer = (id: number) => useQuery(q.viajeChofer(browserDb(), id));
// Migración 153: lo que hizo cada chofer y quién llevó cada operación
export const useTramosDelViaje = (id: number, activo = true) =>
  useQuery({ queryKey: ['logistica', 'viaje-chofer', id, 'tramos'], queryFn: () => viajesChoferRepository(browserDb()).tramosDelViaje(id), enabled: activo });
export const useHistorialChofer = (chofer: number, desde: FechaDia, hasta: FechaDia, activo = true) =>
  useQuery({
    queryKey: ['logistica', 'historial-chofer', chofer, desde, hasta],
    queryFn: () => viajesChoferRepository(browserDb()).historialChofer(chofer, desde, hasta),
    enabled: activo,
  });
export const useHistorialOperacion = (servicio: number, activo = true) =>
  useQuery({ queryKey: ['logistica', 'historial-operacion', servicio], queryFn: () => viajesChoferRepository(browserDb()).historialOperacion(servicio), enabled: activo });
export const useAsignarTractor = () => useEscritura(asignarTractor);
export const useIniciarViajeChofer = () => useEscritura(iniciarViajeChofer);
export const useAgregarItemViaje = () => useEscritura(agregarItemViaje);
export const useAjustarItemViaje = () => useEscritura(ajustarItemViaje);
export const useQuitarItemViaje = () => useEscritura(quitarItemViaje);
export const useContinuarOperacionViaje = () => useEscritura(continuarOperacionViaje);
export const useCambiarChoferViaje = () => useEscritura(cambiarChoferViaje);
export const usePrepararCierreCombustible = () => useEscritura(prepararCierreCombustible);
export const useCerrarViajeChofer = () => useEscritura(cerrarViajeChofer);
export const useCerrarYAprobarViaje = () => useEscritura(cerrarYAprobarViaje);
export const useReabrirViajeChofer = () => useEscritura(reabrirViajeChofer);
export const useAnularViajeChofer = () => useEscritura(anularViajeChofer);

// Migración 51: km reales y costos de los viajes
export const useCostosViaje = (viajeId: number, enabled = true) =>
  useQuery({ queryKey: ['logistica', 'costos', viajeId] as const, queryFn: () => costosRepository(browserDb()).deViaje(viajeId), enabled, staleTime: 60_000 });
export const useCostosViajes = (desde: string, hasta: string) =>
  useQuery({ queryKey: ['logistica', 'costos', 'lista', desde, hasta] as const, queryFn: () => costosRepository(browserDb()).lista(desde, hasta), staleTime: 60_000 });
export const useCategoriasGasto = () =>
  useQuery({ queryKey: ['logistica', 'costos', 'categorias'] as const, queryFn: () => costosRepository(browserDb()).categorias(), staleTime: 3_600_000 });
export const useAgregarGastoViaje = () => useEscritura(agregarGastoViaje);
export const useAnularGastoViaje = () => useEscritura(anularGastoViaje);
