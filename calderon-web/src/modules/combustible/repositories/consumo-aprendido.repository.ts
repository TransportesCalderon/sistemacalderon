import { RepoError, type Db } from '@/shared/repository/types';
import { parsearConsumoChoferes, parsearConsumoRutas, type ConsumoChoferes, type ConsumoRutas } from '../domain/consumo-aprendido.types';

/** Migración 223: consumo aprendido por ruta y choferes con consumo alto. La base valida y calcula todo. */
export const consumoAprendidoRepository = (db: Db) => {
  const fue = () => db.schema('fue');
  const ok = <T>(r: { data: T; error: unknown }): T => {
    if (r.error) throw new RepoError(r.error as ConstructorParameters<typeof RepoError>[0]);
    return r.data;
  };
  return {
    rutas: async (): Promise<ConsumoRutas> => parsearConsumoRutas(ok(await fue().rpc('fn_consumo_rutas'))),
    choferes: async (mes: string): Promise<ConsumoChoferes> => parsearConsumoChoferes(ok(await fue().rpc('fn_consumo_choferes', { p_mes: mes }))),
    recalcular: async (mes: string) => void ok(await fue().rpc('fn_recalcular_consumo_choferes', { p_mes: mes })),
    revisar: async (mes: string, chofer: number, comentario: string) =>
      void ok(await fue().rpc('fn_revisar_consumo_chofer', { p_mes: mes, p_chofer: chofer, p_comentario: comentario })),
    analizar: async (mes: string, chofer: number) => void ok(await fue().rpc('fn_analizar_consumo_chofer_ia', { p_mes: mes, p_chofer: chofer })),
  };
};
