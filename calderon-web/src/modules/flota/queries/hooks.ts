'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { browserDb } from '@/shared/supabase/browser';
import type { CamionId, ChoferId } from '@/shared/types/dominio';
import { crearCamion, editarCamion } from '../actions/camion.actions';
import { cambiarCapacidadTanque, crearTanque, crearTanques, darDeBajaTanque, editarDescripcionTanque, eliminarTanque } from '../actions/tanque.actions';
import { crearChofer, editarChofer, revelarDocumentoChofer } from '../actions/chofer.actions';
import type { CamionEdicionInput, CamionFormInput } from '../domain/camion.schemas';
import type { Camion, CamionListaParams } from '../domain/camion.types';
import type { ChoferEdicionInput, ChoferFormInput } from '../domain/chofer.schemas';
import type { Chofer, ChoferListaParams } from '../domain/chofer.types';
import { basesQueries, camionesQueries, catalogosFlotaQueries, choferesQueries } from './keys';

/** Lista paginada; conserva la página anterior mientras carga la nueva (sin parpadeo). */
export function useCamiones(p: CamionListaParams) {
  return useQuery({ ...camionesQueries.lista(browserDb(), p), placeholderData: keepPreviousData });
}

export function useCamion(id: CamionId, opciones: { enabled?: boolean } = {}) {
  return useQuery({ ...camionesQueries.detalle(browserDb(), id), enabled: opciones.enabled ?? true });
}

export function useCatalogosFlota() {
  return useQuery(catalogosFlotaQueries.obtener(browserDb()));
}

/**
 * Mutaciones: llaman a la server action y devuelven su ActionResult (no lanzan).
 * Si sale bien, dejan la ficha en caché e invalidan las listas de camiones.
 */
function useAlGuardarCamion() {
  const qc = useQueryClient();
  return (camion: Camion) => {
    qc.setQueryData(camionesQueries.detalle(browserDb(), camion.id).queryKey, camion);
    return qc.invalidateQueries({ queryKey: camionesQueries.listas() });
  };
}

export function useCrearCamion() {
  const alGuardar = useAlGuardarCamion();
  return useMutation({
    mutationFn: (input: CamionFormInput) => crearCamion(input),
    onSuccess: (r) => (r.ok ? alGuardar(r.data) : undefined),
  });
}

export function useEditarCamion() {
  const alGuardar = useAlGuardarCamion();
  return useMutation({
    mutationFn: (input: CamionEdicionInput) => editarCamion(input),
    onSuccess: (r) => (r.ok ? alGuardar(r.data) : undefined),
  });
}

// ---------------------------------------------------------------------------
// Tanques del camión (migración 27)
// ---------------------------------------------------------------------------

export function useCapacidades(ids: number[]) {
  return useQuery({ ...camionesQueries.capacidades(browserDb(), ids), enabled: ids.length > 0, placeholderData: keepPreviousData });
}

export function useTanques(camionId: CamionId) {
  return useQuery(camionesQueries.tanques(browserDb(), camionId));
}

/** Cada mutación de tanques devuelve el ActionResult y, si salió bien, vuelve a leer tanques y capacidad. */
function useMutacionTanque<I extends { camionId: number }, R extends { ok: boolean }>(accion: (input: I) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: accion,
    onSuccess: (r, input) =>
      r.ok ? qc.invalidateQueries({ queryKey: camionesQueries.tanques(browserDb(), input.camionId as CamionId).queryKey }) : undefined,
  });
}

export const useCrearTanque = () => useMutacionTanque(crearTanque);
export const useCrearTanques = () => useMutacionTanque(crearTanques);
export const useCambiarCapacidadTanque = () => useMutacionTanque(cambiarCapacidadTanque);
export const useDarDeBajaTanque = () => useMutacionTanque(darDeBajaTanque);
export const useEliminarTanque = () => useMutacionTanque(eliminarTanque);
export const useEditarDescripcionTanque = () => useMutacionTanque(editarDescripcionTanque);

// ---------------------------------------------------------------------------
// Choferes
// ---------------------------------------------------------------------------

export function useChoferes(p: ChoferListaParams) {
  return useQuery({ ...choferesQueries.lista(browserDb(), p), placeholderData: keepPreviousData });
}

export function useChofer(id: ChoferId, opciones: { enabled?: boolean } = {}) {
  return useQuery({ ...choferesQueries.detalle(browserDb(), id), enabled: opciones.enabled ?? true });
}

export function useBases() {
  return useQuery(basesQueries.obtener(browserDb()));
}

function useAlGuardarChofer() {
  const qc = useQueryClient();
  return (chofer: Chofer) => {
    qc.setQueryData(choferesQueries.detalle(browserDb(), chofer.id).queryKey, chofer);
    return qc.invalidateQueries({ queryKey: choferesQueries.listas() });
  };
}

export function useCrearChofer() {
  const alGuardar = useAlGuardarChofer();
  return useMutation({
    mutationFn: (input: ChoferFormInput) => crearChofer(input),
    onSuccess: (r) => (r.ok ? alGuardar(r.data) : undefined),
  });
}

export function useEditarChofer() {
  const alGuardar = useAlGuardarChofer();
  return useMutation({
    mutationFn: (input: ChoferEdicionInput) => editarChofer(input),
    onSuccess: (r) => (r.ok ? alGuardar(r.data) : undefined),
  });
}

/**
 * "Mostrar documento": mutación (no consulta) para que el dato personal nunca quede en la
 * caché de React Query. Cada clic registra un acceso en aud.acceso_sensible.
 */
export function useRevelarDocumento() {
  return useMutation({ mutationFn: (id: ChoferId) => revelarDocumentoChofer({ id }), gcTime: 0 });
}
