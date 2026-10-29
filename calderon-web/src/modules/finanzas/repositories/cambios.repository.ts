import { RepoError, type Db } from '@/shared/repository/types';
import { parsearCostoCambios, parsearSugeridos, type CambiosSugeridos, type CostoCambios } from '../domain/cambios';

/** Migración 123 · Cambios de moneda. Todo lo decide la base; su mensaje se muestra tal cual. */
export const cambiosRepository = (db: Db) => {
  const fin = () => db.schema('fin');
  return {
    async sugeridos(desde: string, hasta: string): Promise<CambiosSugeridos> {
      const { data, error } = await fin().rpc('fn_cambios_sugeridos', { p_desde: desde, p_hasta: hasta });
      if (error) throw new RepoError(error);
      return parsearSugeridos(data);
    },
    async costo(desde: string, hasta: string): Promise<CostoCambios> {
      const { data, error } = await fin().rpc('fn_costo_cambios', { p_desde: desde, p_hasta: hasta });
      if (error) throw new RepoError(error);
      return parsearCostoCambios(data);
    },
    async confirmar(pares: { salida: number; entrada: number }[]): Promise<number> {
      const { data, error } = await fin().rpc('fn_confirmar_cambios', { p_pares: pares });
      if (error) throw new RepoError(error);
      return Number((data as { confirmados?: number } | null)?.confirmados ?? 0);
    },
  };
};
