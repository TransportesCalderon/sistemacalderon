'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { browserDb } from '@/shared/supabase/browser';
import type { CamionId, ChoferId } from '@/shared/types/dominio';
import { crearCamion, editarCamion } from '../actions/camion.actions';
import { cambiarCapacidadTanque, crearTanque, crearTanques, darDeBajaTanque, editarDescripcionTanque, eliminarTanque } from '../actions/tanque.actions';
import { crearChofer, editarChofer, eliminarChofer, revelarDocumentoChofer } from '../actions/chofer.actions';
import type { CamionEdicionInput, CamionFormInput } from '../domain/camion.schemas';
import type { Camion, CamionListaParams } from '../domain/camion.types';
import type { ChoferEdicionInput, ChoferFormInput } from '../domain/chofer.schemas';
import type { Chofer, ChoferListaParams } from '../domain/chofer.types';
import { adjuntarVencimiento, anularVencimiento, registrarVencimiento, vencimientoVisto } from '../actions/vencimientos.actions';
import {
  anularOt,
  asignarOt,
  cargarBaseTarea,
  crearOt,
  guardarTarea,
  iniciarOt,
  notaOt,
  otVista,
  terminarOt,
  verificarOt,
} from '../actions/mantenimiento.actions';
import { mantenimientoRepository } from '../repositories/mantenimiento.repository';
import type { Equipo } from '../domain/vencimientos.types';
import { vencimientosRepository } from '../repositories/vencimientos.repository';
import { basesQueries, camionesQueries, catalogosFlotaQueries, choferesQueries } from './keys';
import { invalidar } from '@/shared/query/invalidar';

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
    return invalidar(qc, 'camion');
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
    onSuccess: (r) => (r.ok ? invalidar(qc, 'tanque') : undefined),
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
    return invalidar(qc, 'chofer');
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

/** Migración 45: eliminar chofer; refresca las listas. */
export function useEliminarChofer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: number; motivo: string }) => eliminarChofer(input),
    onSuccess: (r) => (r.ok ? invalidar(qc, 'chofer') : undefined),
  });
}

// ---- Migración 198: vencimientos de técnicas y matafuegos ----
export const useVencimientos = (activo: boolean) =>
  useQuery({
    queryKey: ['flota', 'vencimientos', 'lista'] as const,
    queryFn: () => vencimientosRepository(browserDb()).lista(),
    enabled: activo,
    placeholderData: keepPreviousData,
    refetchInterval: activo ? 10 * 60_000 : false,
  });
export const useHistorialVencimientos = (equipo: Equipo, id: number | null) =>
  useQuery({
    queryKey: ['flota', 'vencimientos', 'historial', equipo, id] as const,
    queryFn: () => vencimientosRepository(browserDb()).historial(equipo, id!),
    enabled: id !== null,
  });
export const useAvisosVencimiento = (activo: boolean) =>
  useQuery({
    queryKey: ['flota', 'vencimientos', 'avisos'] as const,
    queryFn: () => vencimientosRepository(browserDb()).avisos(),
    enabled: activo,
    refetchInterval: activo ? 5 * 60_000 : false,
  });
export function useRegistrarVencimiento() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: registrarVencimiento, onSuccess: (r) => (r.ok ? invalidar(qc, 'vencimiento') : undefined) });
}
export function useAnularVencimiento() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: anularVencimiento, onSuccess: (r) => (r.ok ? invalidar(qc, 'vencimiento') : undefined) });
}
export function useAdjuntarVencimiento() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: adjuntarVencimiento, onSuccess: (r) => (r.ok ? invalidar(qc, 'vencimiento') : undefined) });
}
export function useVencimientoVisto() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: vencimientoVisto, onSuccess: (r) => (r.ok ? invalidar(qc, 'vencimiento') : undefined) });
}

// ---- Migración 199: plan de mantenimiento y órdenes de trabajo ----
const mant = () => mantenimientoRepository(browserDb());
export const useZonasEquipo = (activo: boolean) =>
  useQuery({ queryKey: ['flota', 'mantenimiento', 'zonas'] as const, queryFn: () => mant().zonas(), enabled: activo, staleTime: 60 * 60_000 });
export const useEquiposMant = (activo: boolean) =>
  useQuery({ queryKey: ['flota', 'mantenimiento', 'equipos'] as const, queryFn: () => mant().equipos(), enabled: activo, staleTime: 10 * 60_000 });
export const useMecanicos = (activo: boolean) =>
  useQuery({ queryKey: ['flota', 'mantenimiento', 'mecanicos'] as const, queryFn: () => mant().mecanicos(), enabled: activo, staleTime: 10 * 60_000 });
export const useOrdenesTrabajo = (activo: boolean, cerradasDias: number) =>
  useQuery({
    queryKey: ['flota', 'mantenimiento', 'ordenes', cerradasDias] as const,
    queryFn: () => mant().ordenes(cerradasDias),
    enabled: activo,
    placeholderData: keepPreviousData,
    refetchInterval: activo ? 2 * 60_000 : false,
  });
export const usePlanMantenimiento = (activo: boolean) =>
  useQuery({ queryKey: ['flota', 'mantenimiento', 'plan'] as const, queryFn: () => mant().plan(), enabled: activo, placeholderData: keepPreviousData });
export const useAvisosOt = (activo: boolean) =>
  useQuery({ queryKey: ['flota', 'mantenimiento', 'avisos'] as const, queryFn: () => mant().avisos(), enabled: activo, refetchInterval: activo ? 2 * 60_000 : false });
function useMutacionMant<A, R>(fn: (a: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: (r) => ((r as { ok?: boolean }).ok ? invalidar(qc, 'mantenimiento') : undefined) });
}
export const useGuardarTarea = () => useMutacionMant(guardarTarea);
export const useCargarBaseTarea = () => useMutacionMant(cargarBaseTarea);
export const useCrearOt = () => useMutacionMant(crearOt);
export const useAsignarOt = () => useMutacionMant(asignarOt);
export const useIniciarOt = () => useMutacionMant(iniciarOt);
export const useTerminarOt = () => useMutacionMant(terminarOt);
export const useVerificarOt = () => useMutacionMant(verificarOt);
export const useAnularOt = () => useMutacionMant(anularOt);
export const useNotaOt = () => useMutacionMant(notaOt);
export const useOtVista = () => useMutacionMant(otVista);
