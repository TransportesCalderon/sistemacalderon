import { RepoError, type Db } from '@/shared/repository/types';
import { parsearIvaPorRecuperar, type FormaRecuperacion, type IvaPorRecuperar } from '../domain/iva-recuperar';

const ok = <T>(r: { data: T; error: unknown }): T => {
  if (r.error) throw new RepoError(r.error as never);
  return r.data;
};

export interface RecuperacionIvaEntrada {
  forma: FormaRecuperacion;
  fecha: string;
  monto: number;
  periodoDesde: string | null;
  periodoHasta: string | null;
  numeroTramite: string | null;
  nota: string | null;
  yaRecuperada: boolean;
}

/** Migración 388 · IVA por recuperar. La base exige Finanzas o TI y valida que no se recupere de más. */
export function ivaRecuperarRepository(db: Db) {
  const fin = () => db.schema('fin');
  return {
    leer: async (): Promise<IvaPorRecuperar> => parsearIvaPorRecuperar(ok(await fin().rpc('fn_iva_por_recuperar'))),
    guardar: async (e: RecuperacionIvaEntrada) =>
      ok(
        await fin().rpc('fn_guardar_iva_recuperacion', {
          p_datos: {
            forma: e.forma,
            fecha: e.fecha,
            monto: e.monto,
            periodo_desde: e.periodoDesde,
            periodo_hasta: e.periodoHasta,
            numero_tramite: e.numeroTramite,
            nota: e.nota,
            ya_recuperada: e.yaRecuperada,
          },
        }),
      ),
    resolver: async (id: number, recuperada: boolean, fecha: string, monto: number | null, nota: string | null) => {
      ok(await fin().rpc('fn_resolver_iva_recuperacion', { p_id: id, p_recuperada: recuperada, p_fecha: fecha, p_monto: monto ?? 0, p_nota: nota }));
    },
    anular: async (id: number, motivo: string) => {
      ok(await fin().rpc('fn_anular_iva_recuperacion', { p_id: id, p_motivo: motivo }));
    },
  };
}
