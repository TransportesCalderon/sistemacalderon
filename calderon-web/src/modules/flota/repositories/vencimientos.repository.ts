import { RepoError, type Db } from '@/shared/repository/types';
import {
  parsearAvisosVencimiento,
  parsearHistorialVencimientos,
  parsearVencimientos,
  type AvisoVencimiento,
  type Equipo,
  type HistorialVencimiento,
  type Vencimientos,
} from '../domain/vencimientos.types';

export interface DatosVencimiento {
  tipo: string;
  equipo: Equipo;
  equipoId: number;
  detalle: string | null;
  realizado: string | null;
  vence: string;
  observacion: string | null;
}

/** Migración 198: vencimientos de técnicas y matafuegos. La base valida todo; su mensaje se muestra tal cual. */
export const vencimientosRepository = (db: Db) => ({
  async lista(): Promise<Vencimientos> {
    const { data, error } = await db.schema('mae').rpc('fn_vencimientos');
    if (error) throw new RepoError(error);
    return parsearVencimientos(data);
  },
  async historial(equipo: Equipo, id: number): Promise<HistorialVencimiento[]> {
    const { data, error } = await db.schema('mae').rpc('fn_historial_vencimientos', { p_equipo: equipo, p_id: id });
    if (error) throw new RepoError(error);
    return parsearHistorialVencimientos(data);
  },
  async registrar(d: DatosVencimiento): Promise<number> {
    const { data, error } = await db.schema('mae').rpc('fn_registrar_vencimiento', {
      p_tipo: d.tipo,
      p_equipo: d.equipo,
      p_equipo_id: d.equipoId,
      p_detalle: d.detalle,
      p_realizado: d.realizado,
      p_vence: d.vence,
      p_observacion: d.observacion,
    });
    if (error) throw new RepoError(error);
    return Number(data);
  },
  async anular(id: number, motivo: string): Promise<void> {
    const { error } = await db.schema('mae').rpc('fn_anular_vencimiento', { p_id: id, p_motivo: motivo });
    if (error) throw new RepoError(error);
  },
  async avisos(): Promise<AvisoVencimiento[]> {
    const { data, error } = await db.schema('mae').rpc('fn_avisos_vencimiento');
    if (error) throw new RepoError(error);
    return parsearAvisosVencimiento(data);
  },
  async visto(id: number): Promise<void> {
    const { error } = await db.schema('mae').rpc('fn_vencimiento_visto', { p_id: id });
    if (error) throw new RepoError(error);
  },
});
