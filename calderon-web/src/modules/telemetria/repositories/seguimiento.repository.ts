import { RepoError, type Db } from '@/shared/repository/types';
import type { Json } from '@/shared/types/db';
import type { DetalleOrden } from '@/modules/combustible/domain/orden-carga.types';
import {
  parsearControles,
  parsearLecturaFoto,
  parsearDatosPedido,
  parsearEvaluacion,
  parsearPedidos,
  parsearTramo,
  parsearViajesEnCurso,
  type ControlViaje,
  type LecturaFoto,
  type DatosPedidoCarga,
  type Evaluacion,
  type PedidoCarga,
  type TramoSeguimiento,
  type ViajeEnCurso,
} from '../domain/seguimiento.types';

/** Migración 194: seguimiento de los viajes en curso. Todo lo decide la base; su mensaje se muestra tal cual. */
export const seguimientoRepository = (db: Db) => ({
  async viajes(): Promise<ViajeEnCurso[]> {
    const { data, error } = await db.schema('tel').rpc('fn_seguimiento_viajes');
    if (error) throw new RepoError(error);
    return parsearViajesEnCurso(data);
  },
  /** Migración 240: lo que leyó la IA de la foto, con los litros calculados por la base. */
  async lecturaFoto(lecturaId: number): Promise<LecturaFoto> {
    const { data, error } = await db.schema('tel').rpc('fn_seguimiento_lectura', { p_lectura: lecturaId });
    if (error) throw new RepoError(error);
    return parsearLecturaFoto(data);
  },
  async registrarConFoto(d: {
    viajeId: number;
    lecturaId: number;
    foto: string;
    desde: string | null;
    km: number | null;
    litros: number | null;
    programador: number | null;
  }): Promise<Evaluacion> {
    const { data, error } = await db.schema('tel').rpc('fn_registrar_seguimiento_foto', {
      p_viaje: d.viajeId,
      p_lectura: d.lecturaId,
      p_foto: d.foto,
      p_desde: d.desde,
      p_km: d.km,
      p_litros: d.litros,
      p_programador: d.programador,
    });
    if (error) throw new RepoError(error);
    return parsearEvaluacion(data);
  },
  async controles(viajeId: number): Promise<ControlViaje[]> {
    const { data, error } = await db.schema('tel').rpc('fn_controles_viaje', { p_viaje: viajeId });
    if (error) throw new RepoError(error);
    return parsearControles(data);
  },
  /** Migración 197: números, evaluación y mensaje desde el momento elegido (sin guardar). */
  async desde(viajeId: number, desde: string): Promise<TramoSeguimiento> {
    const { data, error } = await db.schema('tel').rpc('fn_seguimiento_desde', { p_viaje: viajeId, p_desde: desde });
    if (error) throw new RepoError(error);
    return parsearTramo(data);
  },
  async registrar(viajeId: number, km: number | null, litros: number | null, programador: number | null, desde: string | null = null): Promise<Evaluacion> {
    // p_desde solo si se eligió (con la base anterior a la 197 la función no lo conoce)
    const args = { p_viaje: viajeId, p_km: km, p_litros: litros, p_programador: programador, ...(desde ? { p_desde: desde } : {}) };
    const { data, error } = await db.schema('tel').rpc('fn_registrar_seguimiento', args);
    if (error) throw new RepoError(error);
    return parsearEvaluacion(data);
  },
  /** Migración 195: los números para pedir la carga (precio de la última carga de la estación). */
  async datosPedido(viajeId: number, estacionId: number | null): Promise<DatosPedidoCarga> {
    const { data, error } = await db.schema('tel').rpc('fn_preparar_pedido_carga', { p_viaje: viajeId, p_estacion: estacionId });
    if (error) throw new RepoError(error);
    return parsearDatosPedido(data);
  },
  async pedirCarga(d: PedirCargaDatos): Promise<{ mensaje: string; pendiente: boolean }> {
    const { data, error } = await db.schema('tel').rpc('fn_pedir_carga', {
      p_viaje: d.viajeId,
      p_estacion: d.estacionId,
      p_litros: d.litros,
      p_precio: d.precio,
      p_km: d.km,
      p_gasto: d.gasto,
      p_tanques: d.tanques,
      p_mochila: d.mochila,
      p_programador: d.programador,
      // Migración 259: qué se carga y cómo se manda (solo si vienen: la base anterior no los conoce)
      ...(d.detalle ? { p_detalle: d.detalle as unknown as Json, p_via: d.via ?? 'mensaje', p_observacion: d.observacion ?? null } : {}),
    });
    if (error) throw new RepoError(error);
    const x = (data ?? {}) as { mensaje?: unknown; estado?: unknown };
    return { mensaje: typeof x.mensaje === 'string' ? x.mensaje : '', pendiente: x.estado === 'pendiente' };
  },
  async pedidos(viajeId: number): Promise<PedidoCarga[]> {
    const { data, error } = await db.schema('tel').rpc('fn_pedidos_carga_viaje', { p_viaje: viajeId });
    if (error) throw new RepoError(error);
    return parsearPedidos(data);
  },
});

export interface PedirCargaDatos {
  viajeId: number;
  estacionId: number;
  litros: number;
  precio: number | null;
  km: number | null;
  gasto: number | null;
  tanques: number | null;
  mochila: number | null;
  programador: number | null;
  /** Migración 259: lo mismo que la orden de carga (solo tanques o tanques y mochila). */
  detalle?: DetalleOrden | null;
  via?: 'mensaje' | 'sistema';
  observacion?: string | null;
}
