import { RepoError, type Db } from '@/shared/repository/types';
import {
  parsearControles,
  parsearDatosPedido,
  parsearEvaluacion,
  parsearPedidos,
  parsearTramo,
  parsearViajesEnCurso,
  type ControlViaje,
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
  async pedirCarga(d: PedirCargaDatos): Promise<{ mensaje: string }> {
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
    });
    if (error) throw new RepoError(error);
    const x = (data ?? {}) as { mensaje?: unknown };
    return { mensaje: typeof x.mensaje === 'string' ? x.mensaje : '' };
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
}
