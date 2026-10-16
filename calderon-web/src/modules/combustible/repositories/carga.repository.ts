import { ConflictoVersion, RepoError, rangoPagina, type Db, type Pagina, type Versionado } from '@/shared/repository/types';
import type { Database } from '@/shared/types/db';
import type { CamionId, CargaId, ChoferId, DepositoId, FechaISO, SolicitudId } from '@/shared/types/dominio';
import { diaSiguiente, num } from '../domain/comun';
import type { CargaAlta } from '../domain/carga.schemas';
import {
  TAMANO_PAGINA_CARGAS,
  esEstadoValidacion,
  type Carga,
  type CargaListaParams,
  type CargaResumen,
  type DestinoCarga,
  type ParadaOpcion,
  type RolEnViaje,
  type SituacionCarga,
  type SolicitudPendiente,
} from '../domain/carga.types';
import { nombresDe } from './catalogo-combustible.repository';

/**
 * Repositorio de cargas (fue.carga_combustible y fue.v_carga_combustible).
 * Escribe solo el alta y la confirmación "carga aparte"; la anulación pasa por
 * fue.fn_solicitar_anulacion_carga / fn_resolver_solicitud (C3a: la aprueba otro usuario).
 */
type Fila = Database['fue']['Tables']['carga_combustible']['Row'];

const COLS =
  'id, camion_id, chofer_id, estacion_id, fecha_hora, tipo_combustible_id, litros, precio_unitario, moneda, importe_original, importe_moneda_base, odometro_km, tanque_lleno, tanque_reefer_id, medio_pago, tiene_documento, origen_dato, estado_validacion, motivo_observacion, anula_id, motivo_anulacion, deposito_id, carga_principal_id, es_frontera, aparte_confirmada, mismo_ticket, creado_en, version_fila';
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
  | 'carga_principal_id'
  | 'es_frontera'
  | 'aparte_confirmada'
  | 'mismo_ticket'
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

/** Qué viajes abre o cierra cada frontera, según fue.v_viaje. */
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
  if (f.deposito_id === null) return 'tractor';
  return tipoDeposito === 'tanque_base' ? 'deposito' : 'mochila';
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
      cargaPrincipalId: f.carga_principal_id as CargaId | null,
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
    const [{ resumen, solicitudes }, sustituta, hijas] = await Promise.all([
      enriquecer(db, [f]),
      db.schema('fue').from('carga_combustible').select('id').eq('anula_id', id).maybeSingle(),
      db.schema('fue').from('carga_combustible').select('id, litros, deposito_id, estado_validacion').eq('carga_principal_id', id).order('id'),
    ]);
    if (sustituta.error) throw new RepoError(sustituta.error);
    if (hijas.error) throw new RepoError(hijas.error);
    const depositos = hijas.data.length ? await nombresDe(db, { depositos: hijas.data.map((h) => h.deposito_id ?? NaN) }) : null;
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
      mismoTicket: f.mismo_ticket,
      aparteConfirmada: f.aparte_confirmada,
      depositoId: f.deposito_id as DepositoId | null,
      solicitud: solicitudes.get(f.id) ?? null,
      sustituidaPor: (sustituta.data?.id as CargaId | undefined) ?? null,
      cargasDeLaParada: hijas.data.map((h) => ({
        id: h.id as CargaId,
        litros: Number(h.litros),
        depositoCodigo: h.deposito_id === null ? null : (depositos?.deposito.get(h.deposito_id)?.codigo ?? null),
        estadoValidacion: esEstadoValidacion(h.estado_validacion) ? h.estado_validacion : 'pendiente',
      })),
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
        tanque_lleno: d.destino === 'tractor' && d.tanqueLleno,
        es_frontera: d.destino === 'tractor' && d.esFrontera,
        deposito_id: d.destino === 'mochila' ? d.depositoId : null,
        carga_principal_id: d.destino === 'mochila' ? d.cargaPrincipalId : null,
        mismo_ticket: d.mismoTicket,
        anula_id: d.anulaId,
      })
      .select('id')
      .single();
    if (error) throw new RepoError(error);
    return data.id as CargaId;
  },

  /** Llenados del tractor recientes del camión: paradas posibles para una carga de mochila. */
  async paradas(camionId: number, soloFronteras = false): Promise<ParadaOpcion[]> {
    let q = db
      .schema('fue')
      .from('carga_combustible')
      .select('id, fecha_hora, litros, es_frontera, estacion_id')
      .eq('camion_id', camionId)
      .is('deposito_id', null)
      .is('tanque_reefer_id', null)
      .neq('estado_validacion', 'anulada')
      .is('eliminado_en', null);
    if (soloFronteras) q = q.eq('es_frontera', true);
    const { data, error } = await q.order('fecha_hora', { ascending: false }).limit(60);
    if (error) throw new RepoError(error);
    const nombres = await nombresDe(db, { estaciones: data.map((c) => c.estacion_id ?? NaN) });
    return data.map((c) => ({
      id: c.id as CargaId,
      fechaHora: c.fecha_hora as FechaISO,
      litros: Number(c.litros),
      esFrontera: c.es_frontera,
      estacion: c.estacion_id === null ? null : (nombres.estacion.get(c.estacion_id) ?? null),
    }));
  },

  async solicitarAnulacion(cargaId: number, motivo: string): Promise<SolicitudId> {
    const { data, error } = await db.schema('fue').rpc('fn_solicitar_anulacion_carga', { p_carga: cargaId, p_motivo: motivo });
    if (error) throw new RepoError(error);
    return data as SolicitudId;
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

  async confirmarAparte({ id, versionFila }: Versionado): Promise<void> {
    const { data, error } = await db
      .schema('fue')
      .from('carga_combustible')
      .update({ aparte_confirmada: true, version_fila: versionFila })
      .eq('id', id)
      .eq('version_fila', versionFila)
      .select('id')
      .maybeSingle();
    if (error) throw new RepoError(error);
    if (!data) throw new ConflictoVersion('fue.carga_combustible', id);
  },
});
