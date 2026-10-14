'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { browserDb } from '@/shared/supabase/browser';
import type { CamionId } from '@/shared/types/dominio';
import { crearCamion, editarCamion } from '../actions/camion.actions';
import type { CamionEdicionInput, CamionFormInput } from '../domain/camion.schemas';
import type { Camion, CamionListaParams } from '../domain/camion.types';
import { camionesQueries, catalogosFlotaQueries } from './keys';

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
