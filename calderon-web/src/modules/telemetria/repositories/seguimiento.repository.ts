import { RepoError, type Db } from '@/shared/repository/types';
import { parsearControles, parsearEvaluacion, parsearViajesEnCurso, type ControlViaje, type Evaluacion, type ViajeEnCurso } from '../domain/seguimiento.types';

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
  async registrar(viajeId: number, km: number | null, litros: number | null, programador: number | null): Promise<Evaluacion> {
    const { data, error } = await db.schema('tel').rpc('fn_registrar_seguimiento', { p_viaje: viajeId, p_km: km, p_litros: litros, p_programador: programador });
    if (error) throw new RepoError(error);
    return parsearEvaluacion(data);
  },
});
