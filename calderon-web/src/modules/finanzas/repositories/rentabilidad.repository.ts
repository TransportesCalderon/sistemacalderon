import { RepoError, type Db } from '@/shared/repository/types';
import { parsearRentabilidad, type Agrupacion, type Rentabilidad } from '../domain/rentabilidad';

/** IA-1 · fin.fn_rentabilidad (migración 119). Todo lo calcula la base. */
export const rentabilidadRepository = (db: Db) => ({
  async leer(desde: string, hasta: string, agrupar: Agrupacion): Promise<Rentabilidad> {
    const { data, error } = await db.schema('fin').rpc('fn_rentabilidad', { p_desde: desde, p_hasta: hasta, p_agrupar: agrupar });
    if (error) throw new RepoError(error);
    return parsearRentabilidad(data);
  },
});
