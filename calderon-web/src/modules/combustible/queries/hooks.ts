'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActionResult } from '@/server/actions/result';
import { browserDb } from '@/shared/supabase/browser';
import type { CargaId, CierreViajeId } from '@/shared/types/dominio';
import {
  anularSegmentoBase,
  aprobarSegmentoBase,
  asignarResponsableBase,
  guardarTanqueBase,
  registrarControlBase,
  registrarMovimientoBase,
  resolverMovimientoBase,
  traspasarResponsableBase,
} from '../actions/base.actions';
import { adjuntarDocumento, quitarDocumento, validarCarga } from '../actions/documento.actions';
import { crearCarga, resolverSolicitudCarga, retirarSolicitudCarga, solicitarAnulacionCarga } from '../actions/carga.actions';
import { actualizarLimitesCierre, anularCierre, aprobarCierre, crearBorradorCierre, guardarBorradorCierre } from '../actions/cierre.actions';
import {
  registrarDescarga,
  registrarMovimientoConMotivo,
  resolverMovimiento,
  resolverReversoMovimiento,
  retirarReversoMovimiento,
  solicitarReversoMovimiento,
} from '../actions/movimiento.actions';
import type { CargaListaParams } from '../domain/carga.types';
import type { CierreListaParams } from '../domain/cierre.types';
import type { MovimientoListaParams } from '../domain/movimiento.types';
import type { ViajeListaParams } from '../domain/viaje.types';
import type { Bandeja } from '../domain/documento.types';
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
export const useMovimientos = (p: MovimientoListaParams) => useQuery({ ...q.movimientos.lista(browserDb(), p), placeholderData: keepPreviousData });
export const useTanquesBase = () => useQuery(q.movimientos.tanquesBase(browserDb()));

export const useTanquesDeBase = () => useQuery(q.base.tanques(browserDb()));
export const useControlesBase = (depositoId: number) => useQuery(q.base.controles(browserDb(), depositoId));
export const useLibroBase = (depositoId: number, pagina: number) =>
  useQuery({ ...q.base.libro(browserDb(), depositoId, pagina), placeholderData: keepPreviousData });
export const useResponsablesBase = (depositoId: number) => useQuery(q.base.responsables(browserDb(), depositoId));
export const useUsuarios = () => useQuery(q.base.usuarios(browserDb()));
export const useTiposCombustible = () => useQuery(q.base.tiposCombustible(browserDb()));
export const useSegmentoBase = (controlId: number) => useQuery({ ...q.base.segmento(browserDb(), controlId), retry: false });
export const useVerificacionBase = (aprobacionId: number, enabled: boolean) =>
  useQuery({ ...q.base.verificacion(browserDb(), aprobacionId), enabled, retry: false });

export const useDocumentosCarga = (cargaId: number) => useQuery(q.documentos.deCarga(browserDb(), cargaId));
export const useValidacionCarga = (cargaId: number) => useQuery(q.documentos.validacion(browserDb(), cargaId));
export const useEmisorTicket = (estacionId: number | null) => useQuery(q.documentos.emisor(browserDb(), estacionId));
export const useBandeja = (tipo: Bandeja, pagina: number) =>
  useQuery({ ...q.documentos.bandeja(browserDb(), tipo, pagina), placeholderData: keepPreviousData });

export const useViajes = (p: ViajeListaParams) => useQuery({ ...q.viajes.lista(browserDb(), p), placeholderData: keepPreviousData });

export const useCierres = (p: CierreListaParams) => useQuery({ ...q.cierres.lista(browserDb(), p), placeholderData: keepPreviousData });
export const useCierre = (id: CierreViajeId) => useQuery(q.cierres.detalle(browserDb(), id));
export const useResultadoCierre = (id: CierreViajeId, enabled: boolean) => useQuery({ ...q.cierres.resultado(browserDb(), id), enabled });
export const useVerificacion = (id: CierreViajeId, enabled: boolean) => useQuery({ ...q.cierres.verificacion(browserDb(), id), enabled, retry: false });

/* ----------------------------------------------------------------------------
 * Escrituras: cada una llama a su server action; si sale bien, todo lo de combustible
 * se vuelve a leer (los viajes y los resultados los recalcula la base).
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

export const useRegistrarDescarga = () => useEscritura(registrarDescarga);
export const useRegistrarMovimientoConMotivo = () => useEscritura(registrarMovimientoConMotivo);
export const useResolverMovimiento = () => useEscritura(resolverMovimiento);
export const useSolicitarReversoMovimiento = () => useEscritura(solicitarReversoMovimiento);
export const useResolverReversoMovimiento = () => useEscritura(resolverReversoMovimiento);
export const useRetirarReversoMovimiento = () => useEscritura(retirarReversoMovimiento);

export const useGuardarTanqueBase = () => useEscritura(guardarTanqueBase);
export const useRegistrarControlBase = () => useEscritura(registrarControlBase);
export const useRegistrarMovimientoBase = () => useEscritura(registrarMovimientoBase);
export const useResolverMovimientoBase = () => useEscritura(resolverMovimientoBase);
export const useAsignarResponsableBase = () => useEscritura(asignarResponsableBase);
export const useTraspasarResponsableBase = () => useEscritura(traspasarResponsableBase);
export const useAprobarSegmentoBase = () => useEscritura(aprobarSegmentoBase);
export const useAnularSegmentoBase = () => useEscritura(anularSegmentoBase);

export const useAdjuntarDocumento = () => useEscritura(adjuntarDocumento);
export const useQuitarDocumento = () => useEscritura(quitarDocumento);
export const useValidarCarga = () => useEscritura(validarCarga);

export const useCrearBorrador = () => useEscritura(crearBorradorCierre);
export const useGuardarBorrador = () => useEscritura(guardarBorradorCierre);
export const useActualizarLimites = () => useEscritura(actualizarLimitesCierre);
export const useAprobarCierre = () => useEscritura(aprobarCierre);
export const useAnularCierre = () => useEscritura(anularCierre);
