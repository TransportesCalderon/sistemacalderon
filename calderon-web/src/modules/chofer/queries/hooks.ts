'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActionResult } from '@/server/actions/result';
import { browserDb } from '@/shared/supabase/browser';
import {
  anularMovimientoFondo,
  cargarGastoOficina,
  cerrarFondo,
  enviarPosicion,
  quitarDocumentoChofer,
  quitarDocumentoOficina,
  reabrirFondo,
  registrarEntregaFondo,
  retirarGasto,
  revisarGasto,
  subirDocumentoChofer,
  subirDocumentoOficina,
  subirGasto,
} from '../actions/chofer.actions';
import { choferRepository } from '../repositories/chofer.repository';
import { invalidar } from '@/shared/query/invalidar';

const CLAVE = ['chofer'] as const;
const repo = () => choferRepository(browserDb());

/* Lecturas */
export const useMisCargas = () => useQuery({ queryKey: [...CLAVE, 'mis-cargas'], queryFn: () => repo().misCargas(), refetchInterval: 120_000 });
export const useDocumentosOperacion = (servicioId: number) =>
  useQuery({ queryKey: [...CLAVE, 'documentos', servicioId], queryFn: () => repo().documentos(servicioId), staleTime: 30_000 });
export const useSeguimiento = (servicioId: number, activo = true) =>
  useQuery({
    queryKey: [...CLAVE, 'seguimiento', servicioId],
    queryFn: () => repo().seguimiento(servicioId),
    enabled: activo,
    refetchInterval: 60_000,
  });
export const useCelularesEnVivo = () =>
  useQuery({ queryKey: [...CLAVE, 'celulares'], queryFn: () => repo().celularesEnVivo(), refetchInterval: 60_000 });
export const useMiFondo = () => useQuery({ queryKey: [...CLAVE, 'mi-fondo'], queryFn: () => repo().miFondo() });
export const useFondos = () => useQuery({ queryKey: [...CLAVE, 'fondos'], queryFn: () => repo().fondos() });
export const useCuentaChofer = (choferId: number | null) =>
  useQuery({ queryKey: [...CLAVE, 'cuenta', choferId], queryFn: () => repo().cuenta(choferId!), enabled: !!choferId });
export const useGastosPorRevisar = () => useQuery({ queryKey: [...CLAVE, 'por-revisar'], queryFn: () => repo().gastosPorRevisar() });
export const useResumenLiquidacion = (periodo: string | null) =>
  useQuery({ queryKey: [...CLAVE, 'resumen', periodo], queryFn: () => repo().resumen(periodo), placeholderData: keepPreviousData });
export const usePeriodoDe = (fecha: string) =>
  useQuery({ queryKey: [...CLAVE, 'periodo', fecha], queryFn: () => repo().periodoDe(fecha), staleTime: 3_600_000 });
export const useCategoriasGasto = () => useQuery({ queryKey: [...CLAVE, 'categorias'], queryFn: () => repo().categorias(), staleTime: 600_000 });

/* Escrituras: al terminar bien se vuelve a leer todo el módulo */
function useEscritura<I, T>(accion: (input: I) => Promise<ActionResult<T>>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: accion,
    onSuccess: (r) => (r.ok ? invalidar(qc, 'chofer_portal') : undefined),
  });
}
export const useSubirDocumentoChofer = () => useEscritura(subirDocumentoChofer);
export const useQuitarDocumentoChofer = () => useEscritura(quitarDocumentoChofer);
export const useSubirDocumentoOficina = () => useEscritura(subirDocumentoOficina);
export const useQuitarDocumentoOficina = () => useEscritura(quitarDocumentoOficina);
export const useSubirGasto = () => useEscritura(subirGasto);
export const useRetirarGasto = () => useEscritura(retirarGasto);
export const useRegistrarEntrega = () => useEscritura(registrarEntregaFondo);
export const useCargarGastoOficina = () => useEscritura(cargarGastoOficina);
export const useRevisarGasto = () => useEscritura(revisarGasto);
export const useAnularMovimiento = () => useEscritura(anularMovimientoFondo);
export const useCerrarFondo = () => useEscritura(cerrarFondo);
export const useReabrirFondo = () => useEscritura(reabrirFondo);
/** La posición no invalida nada (se manda cada minuto). */
export const useEnviarPosicion = () => useMutation({ mutationFn: enviarPosicion });
