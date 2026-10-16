'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActionResult } from '@/server/actions/result';
import { browserDb } from '@/shared/supabase/browser';
import type { CargaId, CierreViajeId } from '@/shared/types/dominio';
import { confirmarCargaAparte, crearCarga, resolverSolicitudCarga, retirarSolicitudCarga, solicitarAnulacionCarga } from '../actions/carga.actions';
import { actualizarLimitesCierre, anularCierre, aprobarCierre, crearBorradorCierre, guardarBorradorCierre } from '../actions/cierre.actions';
import { cerrarUsoMochila, cerrarVigenciaMochila, ponerEnMarchaMochila, registrarControlMochila, registrarUsoMochila } from '../actions/mochila.actions';
import type { CargaListaParams } from '../domain/carga.types';
import type { CierreListaParams } from '../domain/cierre.types';
import type { ViajeListaParams } from '../domain/viaje.types';
import { combustibleQueries as q } from './keys';

/* ----------------------------------------------------------------------------
 * Lecturas
 * ------------------------------------------------------------------------- */
export const useCamionesCombustible = () => useQuery(q.catalogos.camiones(browserDb()));
export const useEstaciones = () => useQuery(q.catalogos.estaciones(browserDb()));
export const useChoferesCombustible = () => useQuery(q.catalogos.choferes(browserDb()));
export const useMonedas = () => useQuery(q.catalogos.monedas(browserDb()));

export const useCargas = (p: CargaListaParams) => useQuery({ ...q.cargas.lista(browserDb(), p), placeholderData: keepPreviousData });
export const useCarga = (id: CargaId) => useQuery(q.cargas.detalle(browserDb(), id));
export const useParadas = (camionId: number | null, soloFronteras = false) =>
  useQuery({ ...q.cargas.paradas(browserDb(), camionId ?? 0, soloFronteras), enabled: Boolean(camionId) });

export const useCamionesMochila = () => useQuery(q.mochilas.camiones(browserDb()));
export const useUsosMochila = (camionId: number) => useQuery(q.mochilas.usos(browserDb(), camionId));
export const useHistorialMochilas = (camionId: number | null) =>
  useQuery({ ...q.mochilas.historial(browserDb(), camionId ?? 0), enabled: Boolean(camionId) });
export const useControles = (depositoId: number | null) =>
  useQuery({ ...q.mochilas.controles(browserDb(), depositoId ?? 0), enabled: Boolean(depositoId) });

export const useViajes = (p: ViajeListaParams) => useQuery({ ...q.viajes.lista(browserDb(), p), placeholderData: keepPreviousData });

export const useCierres = (p: CierreListaParams) => useQuery({ ...q.cierres.lista(browserDb(), p), placeholderData: keepPreviousData });
export const useCierre = (id: CierreViajeId) => useQuery(q.cierres.detalle(browserDb(), id));
export const useResultadoCierre = (id: CierreViajeId, enabled: boolean) => useQuery({ ...q.cierres.resultado(browserDb(), id), enabled });
export const useVerificacion = (id: CierreViajeId, enabled: boolean) => useQuery({ ...q.cierres.verificacion(browserDb(), id), enabled, retry: false });

/* ----------------------------------------------------------------------------
 * Escrituras: cada una llama a su server action; si sale bien, todo lo de combustible
 * se vuelve a leer (los viajes, saldos y resultados los recalcula la base).
 * ------------------------------------------------------------------------- */
function useEscritura<I, T>(accion: (input: I) => Promise<ActionResult<T>>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: accion,
    onSuccess: (r) => (r.ok ? qc.invalidateQueries({ queryKey: q.todo() }) : undefined),
  });
}

export const useCrearCarga = () => useEscritura(crearCarga);
export const useSolicitarAnulacion = () => useEscritura(solicitarAnulacionCarga);
export const useResolverSolicitud = () => useEscritura(resolverSolicitudCarga);
export const useRetirarSolicitud = () => useEscritura(retirarSolicitudCarga);
export const useConfirmarAparte = () => useEscritura(confirmarCargaAparte);

export const usePonerEnMarcha = () => useEscritura(ponerEnMarchaMochila);
export const useRegistrarUso = () => useEscritura(registrarUsoMochila);
export const useCerrarUso = () => useEscritura(cerrarUsoMochila);
export const useCerrarVigencia = () => useEscritura(cerrarVigenciaMochila);
export const useRegistrarControl = () => useEscritura(registrarControlMochila);

export const useCrearBorrador = () => useEscritura(crearBorradorCierre);
export const useGuardarBorrador = () => useEscritura(guardarBorradorCierre);
export const useActualizarLimites = () => useEscritura(actualizarLimitesCierre);
export const useAprobarCierre = () => useEscritura(aprobarCierre);
export const useAnularCierre = () => useEscritura(anularCierre);
