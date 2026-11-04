import { RepoError, type Db } from '@/shared/repository/types';
import { parsearComite, type ComiteMes } from '../domain/comite.types';

/** Migración 179 · Comité mensual de consumo. La base controla roles, que el mes esté terminado y que todo esté revisado. */
export const comiteRepository = (db: Db) => ({
  async mes(mes: string): Promise<ComiteMes> {
    const { data, error } = await db.schema('fue').rpc('fn_comite_consumo', { p_mes: mes });
    if (error) throw new RepoError(error);
    return parsearComite(data);
  },
  async revisar(d: { mes: string; tipo: 'tractor' | 'genset'; equipoId: number; revisado: boolean; comentario: string | null; accion: string | null }): Promise<void> {
    const { error } = await db.schema('fue').rpc('fn_revisar_equipo_mes', {
      p_mes: d.mes,
      p_tipo: d.tipo,
      p_equipo: d.equipoId,
      p_revisado: d.revisado,
      p_comentario: d.comentario,
      p_accion: d.accion,
    });
    if (error) throw new RepoError(error);
  },
  async cerrar(d: { mes: string; participantes: string; conclusiones: string | null }): Promise<void> {
    const { error } = await db.schema('fue').rpc('fn_cerrar_comite', { p_mes: d.mes, p_participantes: d.participantes, p_conclusiones: d.conclusiones });
    if (error) throw new RepoError(error);
  },
});
