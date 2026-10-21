import { RepoError, rangoPagina, type Db, type Pagina } from '@/shared/repository/types';
import type { Database } from '@/shared/types/db';
import type { CamionId, CargaId, ChoferId, DepositoId, FechaISO, SolicitudId } from '@/shared/types/dominio';
import { diaSiguiente, num } from '../domain/comun';
import type { CargaAlta, CargaEdicion } from '../domain/carga.schemas';
import { BUCKET_DOCUMENTOS } from '../domain/documento.types';
import {
  TAMANO_PAGINA_CARGAS,
  esEstadoValidacion,
  type Carga,
  type CargaListaParams,
  type CargaResumen,
  type DestinoCarga,
  type RolEnViaje,
  type SituacionCarga,
  type SolicitudPendiente,
} from '../domain/carga.types';
import { nombresDe } from './catalogo-combustible.repository';

/**
 * Repositorio de cargas (fue.carga_combustible y fue.v_carga_combustible).
 * Escribe solo el alta; la anulación pasa por fue.fn_solicitar_anulacion_carga /
 * fn_resolver_solicitud (C3a: la aprueba otro usuario).
 */
type Fila = Database['fue']['Tables']['carga_combustible']['Row'];

const COLS =
  'id, camion_id, chofer_id, estacion_id, fecha_hora, tipo_combustible_id, litros, precio_unitario, moneda, importe_original, importe_moneda_base, odometro_km, tanque_lleno, tanque_reefer_id, medio_pago, tiene_documento, origen_dato, estado_validacion, motivo_observacion, anula_id, motivo_anulacion, deposito_id, es_frontera, faltante_lleno_l, faltante_observacion, creado_en, version_fila';
type FilaCarga = Pick<
  Fila,
  | 'id'
  | 'camion_id'
  | 'chofer_id'
  | 'estacion_id'
  | 'fecha_hora'
  | 'tipo_combustible_id'
  | 'litros'
  | 'precio_unitario'
  | 'moneda'
  | 'importe_original'
  | 'importe_moneda_base'
  | 'odometro_km'
  | 'tanque_lleno'
  | 'tanque_reefer_id'
  | 'medio_pago'
  | 'tiene_documento'
  | 'origen_dato'
  | 'estado_validacion'
  | 'motivo_observacion'
  | 'anula_id'
  | 'motivo_anulacion'
  | 'deposito_id'
  | 'es_frontera'
  | 'faltante_lleno_l'
  | 'faltante_observacion'
  | 'creado_en'
  | 'version_fila'
>;

/** Solicitudes de anulación pendientes de un conjunto de cargas (o todas si no se pasan ids). */
async function solicitudesPendientes(db: Db, cargaIds?: number[]): Promise<Map<number, SolicitudPendiente>> {
  if (cargaIds && cargaIds.length === 0) return new Map();
  let q = db.schema('fue').from('solicitud_correccion').select('id, carga_id, motivo, creado_por, creado_en').eq('estado', 'pendiente').eq('tipo', 'anular_carga');
  if (cargaIds) q = q.in('carga_id', cargaIds);
  const { data, error } = await q;
  if (error) throw new RepoError(error);
  return new Map(
    data
      .filter((s) => s.carga_id !== null)
      .map((s) => [
        s.carga_id as number,
        { id: s.id as SolicitudId, motivo: s.motivo, creadoPor: s.creado_por, creadoEn: s.creado_en as FechaISO },
      ]),
  );
}

/** Qué viajes abre o cierra cada corte de viaje, según fue.v_viaje. */
async function rolesEnViaje(db: Db, fronteraIds: number[]): Promise<Map<number, RolEnViaje>> {
  const roles = new Map<number, RolEnViaje>();
  if (fronteraIds.length === 0) return roles;
  const lista = `(${fronteraIds.join(',')})`;
  const { data, error } = await db
    .schema('fue')
    .from('v_viaje')
    .select('carga_salida_id, carga_llegada_id')
    .or(`carga_salida_id.in.${lista},carga_llegada_id.in.${lista}`);
  if (error) throw new RepoError(error);
  for (const id of fronteraIds) roles.set(id, { inicia: false, termina: false });
  for (const v of data) {
    if (v.carga_salida_id !== null && roles.has(v.carga_salida_id)) roles.get(v.carga_salida_id)!.inicia = true;
    if (v.carga_llegada_id !== null && roles.has(v.carga_llegada_id)) roles.get(v.carga_llegada_id)!.termina = true;
  }
  return roles;
}

function destinoDe(f: Pick<FilaCarga, 'deposito_id' | 'tanque_reefer_id'>, tipoDeposito: string | undefined): DestinoCarga {
  if (f.tanque_reefer_id !== null) return 'frio';
  if (f.deposito_id === null) return 'camion';
  return tipoDeposito === 'tanque_base' ? 'deposito' : 'mochila_anterior';
}

async function enriquecer(db: Db, filas: FilaCarga[]): Promise<{ resumen: CargaResumen[]; solicitudes: Map<number, SolicitudPendiente> }> {
  const ids = filas.map((f) => f.id);
  const [nombres, solicitudes, roles] = await Promise.all([
    nombresDe(db, {
      camiones: filas.map((f) => f.camion_id),
      choferes: filas.map((f) => f.chofer_id ?? NaN),
      estaciones: filas.map((f) => f.estacion_id ?? NaN),
      depositos: filas.map((f) => f.deposito_id ?? NaN),
    }),
    solicitudesPendientes(db, ids),
    rolesEnViaje(
      db,
      filas.filter((f) => f.es_frontera).map((f) => f.id),
    ),
  ]);
  const resumen = filas.map((f): CargaResumen => {
    const estado = esEstadoValidacion(f.estado_validacion) ? f.estado_validacion : 'pendiente';
    const situacion: SituacionCarga = estado === 'anulada' ? 'anulada' : solicitudes.has(f.id) ? 'anulacion_pendiente' : 'normal';
    const deposito = f.deposito_id === null ? undefined : nombres.deposito.get(f.deposito_id);
    return {
      id: f.id as CargaId,
      fechaHora: f.fecha_hora as FechaISO,
      camionId: f.camion_id as CamionId,
      camionPatente: nombres.patente.get(f.camion_id) ?? null,
      choferNombre: f.chofer_id === null ? null : (nombres.chofer.get(f.chofer_id) ?? null),
      estacion: f.estacion_id === null ? null : (nombres.estacion.get(f.estacion_id) ?? null),
      litros: Number(f.litros),
      tanqueLleno: f.tanque_lleno,
      esFrontera: f.es_frontera,
      destino: destinoDe(f, deposito?.tipo),
      depositoCodigo: deposito?.codigo ?? null,
      faltanteLlenoL: Number(f.faltante_lleno_l),
      estadoValidacion: estado,
      situacion,
      rolViaje: roles.get(f.id) ?? { inicia: false, termina: false },
    };
  });
  return { resumen, solicitudes };
}

export const cargaRepository = (db: Db) => ({
  async listar(p: CargaListaParams): Promise<Pagina<CargaResumen>> {
    const [desde, hasta] = rangoPagina(p.pagina, TAMANO_PAGINA_CARGAS);
    let q = db.schema('fue').from('v_carga_combustible').select(COLS, { count: 'exact' });
    if (p.camionId !== undefined) q = q.eq('camion_id', p.camionId);
    if (p.desde) q = q.gte('fecha_hora', `${p.desde}T00:00:00Z`);
    if (p.hasta) q = q.lt('fecha_hora', `${diaSiguiente(p.hasta)}T00:00:00Z`);
    if (p.soloFronteras) q = q.eq('es_frontera', true);
    if (p.situacion === 'anulada') q = q.eq('estado_validacion', 'anulada');
    if (p.situacion === 'anulacion_pendiente' || p.situacion === 'normal') {
      const pendientes = [...(await solicitudesPendientes(db)).keys()];
      if (p.situacion === 'anulacion_pendiente') {
        if (pendientes.length === 0) return { filas: [], total: 0 };
        q = q.in('id', pendientes);
      } else {
        q = q.neq('estado_validacion', 'anulada');
        if (pendientes.length > 0) q = q.not('id', 'in', `(${pendientes.join(',')})`);
      }
    }
    const { data, count, error } = await q.order('fecha_hora', { ascending: false }).order('id', { ascending: false }).range(desde, hasta);
    if (error) throw new RepoError(error);
    const { resumen } = await enriquecer(db, data as FilaCarga[]);
    return { filas: resumen, total: count };
  },

  async obtener(id: CargaId): Promise<Carga | null> {
    const { data, error } = await db.schema('fue').from('carga_combustible').select(COLS).eq('id', id).maybeSingle();
    if (error) throw new RepoError(error);
    if (!data) return null;
    const f = data as FilaCarga;
    const [{ resumen, solicitudes }, sustituta] = await Promise.all([
      enriquecer(db, [f]),
      db.schema('fue').from('carga_combustible').select('id').eq('anula_id', id).maybeSingle(),
    ]);
    if (sustituta.error) throw new RepoError(sustituta.error);
    return {
      ...resumen[0]!,
      choferId: f.chofer_id as ChoferId | null,
      estacionId: f.estacion_id,
      tipoCombustibleId: f.tipo_combustible_id,
      precioUnitario: Number(f.precio_unitario),
      moneda: f.moneda.trim(),
      importeOriginal: Number(f.importe_original),
      importeMonedaBase: num(f.importe_moneda_base),
      medioPago: f.medio_pago,
      odometroKm: num(f.odometro_km),
      tieneDocumento: f.tiene_documento,
      origenDato: f.origen_dato,
      motivoObservacion: f.motivo_observacion,
      anulaId: f.anula_id as CargaId | null,
      motivoAnulacion: f.motivo_anulacion,
      faltanteObservacion: f.faltante_observacion,
      depositoId: f.deposito_id as DepositoId | null,
      solicitud: solicitudes.get(f.id) ?? null,
      sustituidaPor: (sustituta.data?.id as CargaId | undefined) ?? null,
      versionFila: f.version_fila,
      creadoEn: f.creado_en as FechaISO,
    };
  },

  async crear(d: CargaAlta): Promise<CargaId> {
    const { data, error } = await db
      .schema('fue')
      .from('carga_combustible')
      .insert({
        camion_id: d.camionId,
        chofer_id: d.choferId,
        estacion_id: d.estacionId,
        fecha_hora: d.fechaHora,
        tipo_combustible_id: d.tipoCombustibleId,
        litros: d.litros,
        precio_unitario: d.precioUnitario,
        moneda: d.moneda,
        importe_original: d.importeOriginal,
        medio_pago: d.medioPago,
        odometro_km: d.odometroKm,
        origen_dato: 'manual',
        tanque_lleno: d.tanqueLleno,
        es_frontera: d.esFrontera,
        faltante_lleno_l: d.esFrontera ? d.faltanteLlenoL : 0,
        faltante_observacion: d.esFrontera ? d.faltanteObservacion : null,
        anula_id: d.anulaId,
      })
      .select('id')
      .single();
    if (error) throw new RepoError(error);
    return data.id as CargaId;
  },

  /** Migración 47: fue.fn_editar_carga (corrige en el lugar; queda en la auditoría). */
  async editar(d: CargaEdicion): Promise<void> {
    const { error } = await db.schema('fue').rpc('fn_editar_carga', {
      p_carga: d.cargaId,
      p_version: d.versionFila,
      p_datos: {
        chofer_id: d.choferId,
        estacion_id: d.estacionId,
        fecha_hora: d.fechaHora,
        litros: d.litros,
        precio_unitario: d.precioUnitario,
        moneda: d.moneda,
        medio_pago: d.medioPago,
        odometro_km: d.odometroKm,
        tanque_lleno: d.tanqueLleno,
        es_frontera: d.esFrontera,
        faltante_lleno_l: d.esFrontera ? d.faltanteLlenoL : 0,
        faltante_observacion: d.esFrontera ? d.faltanteObservacion : null,
      },
      p_motivo: d.motivo,
    });
    if (error) throw new RepoError(error);
  },

  /** Migración 47: odómetro de la telemetría más cercano a la hora de la carga (±6 h). */
  async odometroTelemetria(camionId: number, fechaHora: string): Promise<{ km: number; ts: FechaISO } | null> {
    const { data, error } = await db.schema('fue').rpc('fn_odometro_telemetria', { p_camion: camionId, p_ts: fechaHora });
    if (error) throw new RepoError(error);
    const o = data as { odometro_km?: number | string; ts?: string } | null;
    return o && o.odometro_km !== undefined && o.ts ? { km: Number(o.odometro_km), ts: o.ts as FechaISO } : null;
  },

  /** Chofer fijo del tractor en esa fecha (migración 46): se propone en el formulario de la carga. */
  async choferDeTractor(camionId: number, fecha: string): Promise<number | null> {
    const { data, error } = await db.schema('mae').rpc('fn_chofer_de_tractor', { p_camion: camionId, p_fecha: fecha });
    if (error) throw new RepoError(error);
    return data === null || data === undefined ? null : Number(data);
  },

  async solicitarAnulacion(cargaId: number, motivo: string): Promise<SolicitudId> {
    const { data, error } = await db.schema('fue').rpc('fn_solicitar_anulacion_carga', { p_carga: cargaId, p_motivo: motivo });
    if (error) throw new RepoError(error);
    return data as SolicitudId;
  },

  /** Migración 44: elimina la carga en la base y después sus archivos (si el depósito no deja, quedan huérfanos sin datos). */
  async eliminar(cargaId: number, motivo: string): Promise<void> {
    const { data, error } = await db.schema('fue').rpc('fn_eliminar_carga', { p_carga: cargaId, p_motivo: motivo });
    if (error) throw new RepoError(error);
    const archivos = (data ?? []).filter(Boolean);
    if (archivos.length > 0) await db.storage.from(BUCKET_DOCUMENTOS).remove(archivos);
  },

  async resolverSolicitud(solicitudId: number, aprobar: boolean, motivo: string | null): Promise<void> {
    const { error } = await db.schema('fue').rpc('fn_resolver_solicitud', { p_id: solicitudId, p_aprobar: aprobar, p_motivo: motivo });
    if (error) throw new RepoError(error);
  },

  async retirarSolicitud(solicitudId: number): Promise<void> {
    const { error } = await db.schema('fue').rpc('fn_retirar_solicitud', { p_id: solicitudId });
    if (error) throw new RepoError(error);
  },

  async cargaDeSolicitud(solicitudId: number): Promise<CargaId | null> {
    const { data, error } = await db.schema('fue').from('solicitud_correccion').select('carga_id').eq('id', solicitudId).maybeSingle();
    if (error) throw new RepoError(error);
    return (data?.carga_id as CargaId | null | undefined) ?? null;
  },
});
