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
import { crearCarga, editarCarga, eliminarCarga, resolverSolicitudCarga, retirarSolicitudCarga, solicitarAnulacionCarga } from '../actions/carga.actions';
import { cerrarComite, revisarEquipoMes } from '../actions/comite.actions';
import { comiteRepository } from '../repositories/comite.repository';
import { consumoRepository } from '../repositories/consumo.repository';
import {
  actualizarLimitesCierre,
  anularCierre,
  aprobarCierre,
  crearBorradorCierre,
  decidirDiferencia,
  guardarBorradorCierre,
  pedirQuitarDescuento,
  resolverQuitarDescuento,
  retirarQuitarDescuento,
} from '../actions/cierre.actions';
import { cierreRepository } from '../repositories/cierre.repository';
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
import type { PeriodoParams } from '../domain/consumo.types';
import { combustibleQueries as q } from './keys';
import { cargaRepository } from '../repositories/carga.repository';
import { gensetRepository } from '../repositories/genset.repository';
import { ralentiRepository } from '../repositories/ralenti.repository';
import { anularCierreRalenti, cerrarRalenti } from '../actions/ralenti.actions';
import { anularCierreGenset, cerrarGenset, eliminarRegistroGenset, registrarGenset } from '../actions/genset.actions';
import { invalidar } from '@/shared/query/invalidar';

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

/** Migración 181: viento de los viajes del período (Cargado vs. motor). */
export const useVientosViajes = (p: PeriodoParams, activo: boolean) =>
  useQuery({ queryKey: ['combustible', 'consumo', 'vientos', p], queryFn: () => consumoRepository(browserDb()).vientos(p), enabled: activo, placeholderData: keepPreviousData });
export const useConciliacionViajes = (p: PeriodoParams) => useQuery({ ...q.consumo.viajes(browserDb(), p), placeholderData: keepPreviousData });
export const useConsumoCamiones = (p: PeriodoParams) => useQuery({ ...q.consumo.camiones(browserDb(), p), placeholderData: keepPreviousData });

export const useViajes = (p: ViajeListaParams) => useQuery({ ...q.viajes.lista(browserDb(), p), placeholderData: keepPreviousData });

export const useCierres = (p: CierreListaParams) => useQuery({ ...q.cierres.lista(browserDb(), p), placeholderData: keepPreviousData });
export const useCierre = (id: CierreViajeId) => useQuery(q.cierres.detalle(browserDb(), id));
export const useResultadoCierre = (id: CierreViajeId, enabled: boolean) => useQuery({ ...q.cierres.resultado(browserDb(), id), enabled });
/** Migración 206: balance del tanque del cierre (salió con, cargó, llegó con). */
export const useTanqueCierre = (id: CierreViajeId, enabled: boolean) =>
  useQuery({ queryKey: ['combustible', 'cierres', 'tanque', id] as const, queryFn: () => cierreRepository(browserDb()).tanque(id), enabled });
/** Migración 53: lo que dice la telemetría para el cierre, para mostrarlo al lado de cada campo del borrador. */
export const useTelemetriaCierre = (id: CierreViajeId, enabled: boolean) =>
  useQuery({ queryKey: ['combustible', 'cierres', 'telemetria', id] as const, queryFn: () => cierreRepository(browserDb()).telemetria(id), enabled, staleTime: 60_000 });
export const useVerificacion = (id: CierreViajeId, enabled: boolean) => useQuery({ ...q.cierres.verificacion(browserDb(), id), enabled, retry: false });

/* ----------------------------------------------------------------------------
 * Escrituras: cada una llama a su server action; si sale bien, todo lo de combustible
 * se vuelve a leer (los viajes y los resultados los recalcula la base).
 * ------------------------------------------------------------------------- */
function useEscritura<I, T>(accion: (input: I) => Promise<ActionResult<T>>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: accion,
    onSuccess: (r) => (r.ok ? invalidar(qc, 'combustible') : undefined),
  });
}

export const useCrearCarga = () => useEscritura(crearCarga);
/** Migración 179 · Comité mensual de consumo. */
export const useComite = (mes: string, activo: boolean) =>
  useQuery({ queryKey: ['combustible', 'comite', mes], queryFn: () => comiteRepository(browserDb()).mes(mes), enabled: activo, placeholderData: keepPreviousData });
export const useRevisarEquipoMes = () => useEscritura(revisarEquipoMes);
export const useCerrarComite = () => useEscritura(cerrarComite);
export const useEditarCarga = () => useEscritura(editarCarga);
/** Migración 47: odómetro de la telemetría para la hora de la carga (se propone en el formulario). */
export const useOdometroTelemetria = (camionId: number | null, fechaHora: string | null) =>
  useQuery({
    queryKey: ['combustible', 'odometro', camionId, fechaHora] as const,
    queryFn: () => cargaRepository(browserDb()).odometroTelemetria(camionId!, fechaHora!),
    enabled: !!camionId && !!fechaHora,
    staleTime: 60_000,
  });
/** Chofer fijo del tractor a la fecha de la carga (se propone; se puede cambiar). */
export const useChoferDeTractor = (camionId: number | null, fecha: string | null) =>
  useQuery({
    queryKey: ['combustible', 'chofer-tractor', camionId, fecha] as const,
    queryFn: () => cargaRepository(browserDb()).choferDeTractor(camionId!, fecha!),
    enabled: !!camionId && !!fecha,
    staleTime: 60_000,
  });
export const useSolicitarAnulacion = () => useEscritura(solicitarAnulacionCarga);
export const useEliminarCarga = () => useEscritura(eliminarCarga);
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
/** Migración 185 */
export const useDecisionCierre = (id: number, activo = true) =>
  useQuery({ queryKey: ['combustible', 'cierres', 'decision', id], queryFn: () => cierreRepository(browserDb()).decision(id), enabled: activo });
export const useDecidirDiferencia = () => useEscritura(decidirDiferencia);
/** Migración 200: segunda aprobación del cierre. */
export const useSegundoNivelCierre = (id: number, activo = true) =>
  useQuery({ queryKey: ['combustible', 'cierres', 'segundo-nivel', id], queryFn: () => cierreRepository(browserDb()).segundoNivel(id), enabled: activo });
export const useEsperanSegundoNivel = (activo: boolean) =>
  useQuery({
    queryKey: ['combustible', 'cierres', 'esperan-segundo-nivel'],
    queryFn: () => cierreRepository(browserDb()).esperanSegundoNivel(),
    enabled: activo,
    refetchInterval: activo ? 5 * 60_000 : false,
  });
export const usePedirQuitarDescuento = () => useEscritura(pedirQuitarDescuento);
export const useResolverQuitarDescuento = () => useEscritura(resolverQuitarDescuento);
export const useRetirarQuitarDescuento = () => useEscritura(retirarQuitarDescuento);
/** Migración 191: patrones por estación (solo lectura). */
export const usePatronesEstaciones = (dias: number, activo: boolean) =>
  useQuery({
    queryKey: ['combustible', 'consumo', 'estaciones', dias],
    queryFn: () => consumoRepository(browserDb()).patronesEstaciones(dias),
    enabled: activo,
    placeholderData: keepPreviousData,
  });
export const useDetalleEstacion = (estacionId: number | null, dias: number) =>
  useQuery({
    queryKey: ['combustible', 'consumo', 'estacion-detalle', estacionId, dias],
    queryFn: () => consumoRepository(browserDb()).detalleEstacion(estacionId!, dias),
    enabled: estacionId !== null,
  });
export const useDiferenciasChoferes = (desde: string, hasta: string, activo: boolean) =>
  useQuery({
    queryKey: ['combustible', 'consumo', 'diferencias-choferes', desde, hasta],
    queryFn: () => consumoRepository(browserDb()).diferenciasChoferes(desde, hasta),
    enabled: activo,
    placeholderData: keepPreviousData,
  });

// Migración 48: combustible de los gensets
export const useGensetsCombustible = () =>
  useQuery({ queryKey: ['combustible', 'gensets'] as const, queryFn: () => gensetRepository(browserDb()).lista(), staleTime: 0 });
export const useFichaGenset = (gensetId: number) =>
  useQuery({ queryKey: ['combustible', 'gensets', gensetId] as const, queryFn: () => gensetRepository(browserDb()).ficha(gensetId), staleTime: 15_000 });
export const useRegistrarGenset = () => useEscritura(registrarGenset);
/** Migración 202: Cargas › Gensets y contexto del genset para completar la carga. */
export const useCargasGenset = (desde: string | null, hasta: string | null, gensetId: number | null, activo = true) =>
  useQuery({
    queryKey: ['combustible', 'gensets', 'cargas', desde, hasta, gensetId],
    queryFn: () => gensetRepository(browserDb()).cargas(desde, hasta, gensetId),
    enabled: activo,
    placeholderData: keepPreviousData,
  });
export const useTableroGensets = (desde: string, hasta: string, activo = true) =>
  useQuery({
    queryKey: ['combustible', 'gensets', 'tablero', desde, hasta],
    queryFn: () => gensetRepository(browserDb()).tablero(desde, hasta),
    enabled: activo && desde !== '' && hasta !== '',
    placeholderData: keepPreviousData,
  });
export const useContextoGenset = (gensetId: number | null, ts: string | null, activo = true) =>
  useQuery({
    queryKey: ['combustible', 'gensets', 'contexto', gensetId, ts],
    queryFn: () => gensetRepository(browserDb()).contexto(gensetId!, ts),
    enabled: activo && gensetId !== null,
    staleTime: 60_000,
  });
export const useEliminarRegistroGenset = () => useEscritura(eliminarRegistroGenset);
export const useCerrarGenset = () => useEscritura(cerrarGenset);
export const useAnularCierreGenset = () => useEscritura(anularCierreGenset);

// Migración 50: ralentí permitido por mes
export const useRalentiMes = (mes: string) =>
  useQuery({ queryKey: ['combustible', 'ralenti', mes] as const, queryFn: () => ralentiRepository(browserDb()).mes(mes), staleTime: 30_000, placeholderData: keepPreviousData });
export const useCerrarRalenti = () => useEscritura(cerrarRalenti);
export const useAnularCierreRalenti = () => useEscritura(anularCierreRalenti);
