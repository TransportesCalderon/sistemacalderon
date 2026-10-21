'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { browserDb } from '@/shared/supabase/browser';
import { agregarGastoViaje, anularGastoViaje } from '../actions/costos.actions';
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
  asignarTercero,
  cancelarOperacion,
  confirmarOperacion,
  eliminarLinea,
  eliminarTransportista,
  guardarLinea,
  guardarOperacion,
  guardarTransportista,
  quitarEquipo,
  registrarHito,
  terminarDemora,
} from '../actions/operaciones.actions';
import {
  agregarItemViaje,
  ajustarItemViaje,
  anularViajeChofer,
  asignarTractor,
  cambiarChoferViaje,
  cerrarViajeChofer,
  cerrarYAprobarViaje,
  iniciarViajeChofer,
  prepararCierreCombustible,
  quitarItemViaje,
  reabrirViajeChofer,
} from '../actions/viajes-chofer.actions';
import type { FechaDia } from '@/shared/types/dominio';
import { logisticaQueries as q } from './keys';

export const useViajesAbiertos = () => useQuery({ ...q.abiertos(browserDb()), refetchInterval: 60_000 });
export const useOpcionesViaje = () => useQuery(q.opciones(browserDb()));
export const useOperaciones = (desde: FechaDia | null, hasta: FechaDia | null) =>
  useQuery({ ...q.operaciones(browserDb(), desde, hasta), refetchInterval: 60_000 });
export const useSugerenciaCliente = (cliente: number | null) =>
  useQuery({ ...q.sugerencia(browserDb(), cliente ?? 0), enabled: !!cliente });
export const useLineas = () => useQuery(q.lineas(browserDb()));
export const useTransportistas = () => useQuery(q.transportistas(browserDb()));

/** El mismo aviso de tiempo real de la Pizarra («cambió la pizarra») refresca también la lista de Logística. */
export const useViajesEnVivo = () => usePizarraEnVivo(['logistica']);

function useEscritura<I, R extends { ok: boolean }>(accion: (input: I) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: accion,
    onSuccess: async (r) => {
      if (!r.ok) return;
      await Promise.all([
        qc.invalidateQueries({ queryKey: q.todo() }),
        qc.invalidateQueries({ queryKey: ['pizarra'] }),
        qc.invalidateQueries({ queryKey: ['combustible'] }),
      ]);
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
export const useGuardarLinea = () => useEscritura(guardarLinea);
export const useEliminarLinea = () => useEscritura(eliminarLinea);
export const useGuardarTransportista = () => useEscritura(guardarTransportista);
export const useEliminarTransportista = () => useEscritura(eliminarTransportista);
export const useAltaOperaciones = () => useEscritura(altaOperaciones);
export const useAvanzarOperacion = () => useEscritura(avanzarOperacion);

// Migración 46: tractores y viajes de chofer
export const useTractores = () => useQuery({ ...q.tractores(browserDb()), refetchInterval: 60_000 });
export const useViajesChofer = (desde: FechaDia | null, hasta: FechaDia | null) => useQuery(q.viajesChofer(browserDb(), desde, hasta));
export const useViajeChofer = (id: number) => useQuery(q.viajeChofer(browserDb(), id));
export const useAsignarTractor = () => useEscritura(asignarTractor);
export const useIniciarViajeChofer = () => useEscritura(iniciarViajeChofer);
export const useAgregarItemViaje = () => useEscritura(agregarItemViaje);
export const useAjustarItemViaje = () => useEscritura(ajustarItemViaje);
export const useQuitarItemViaje = () => useEscritura(quitarItemViaje);
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
