import { RepoError, type Db } from '@/shared/repository/types';
import { parsearFueraHorario, type FueraHorario } from '../domain/horario.types';

/** Migración 286 · Horario de manejo: lo decide y controla la base; la web muestra y habilita. */
export const horarioRepository = (db: Db) => ({
  async fueraHorario(): Promise<FueraHorario> {
    const { data, error } = await db.schema('tel').rpc('fn_fuera_horario');
    if (error) throw new RepoError(error);
    return parsearFueraHorario(data);
  },
  async habilitar(camionId: number, motivo: string): Promise<void> {
    const { error } = await db.schema('tel').rpc('fn_habilitar_fuera_horario', { p_camion: camionId, p_motivo: motivo });
    if (error) throw new RepoError(error);
  },
  /** Migración 389: el acta de la infracción (la base la arma con los datos de la noche). */
  async labrarActa(id: number, descripcion: string | null, lugar: string | null): Promise<{ id: number; numero: string }> {
    const { data, error } = await db.schema('tel').rpc('fn_labrar_acta_fuera_horario', { p_id: id, p_descripcion: descripcion, p_lugar: lugar });
    if (error) throw new RepoError(error);
    const r = (data ?? {}) as { id?: number; numero?: string };
    return { id: Number(r.id), numero: String(r.numero ?? '') };
  },
  async sinSancion(id: number, motivo: string): Promise<void> {
    const { error } = await db.schema('tel').rpc('fn_sin_sancion_fuera_horario', { p_id: id, p_motivo: motivo });
    if (error) throw new RepoError(error);
  },
  async anular(id: number, motivo: string | null): Promise<void> {
    const { error } = await db.schema('tel').rpc('fn_anular_habilitacion_horario', { p_id: id, p_motivo: motivo });
    if (error) throw new RepoError(error);
  },
});
