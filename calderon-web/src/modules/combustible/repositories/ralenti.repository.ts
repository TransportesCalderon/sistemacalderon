import { RepoError, type Db } from '@/shared/repository/types';
import { num } from '../domain/comun';
import type { CerrarRalenti } from '../domain/ralenti.schemas';
import type { RalentiChofer } from '../domain/ralenti.types';

/** Ralentí permitido por mes (migración 50). Todo lo calcula la base; su mensaje se muestra tal cual. */
export const ralentiRepository = (db: Db) => {
  const fue = () => db.schema('fue');
  return {
    async mes(mes: string): Promise<RalentiChofer[]> {
      const { data, error } = await fue().rpc('fn_ralenti_mes', { p_mes: mes });
      if (error) throw new RepoError(error);
      return (data ?? []).map((f) => ({
        choferId: f.chofer_id,
        chofer: f.chofer,
        ralentiL: Number(f.ralenti_l),
        ralentiH: num(f.ralenti_h),
        dias: f.dias,
        diasSinLitros: f.dias_sin_litros,
        camiones: f.camiones,
        permitidoL: Number(f.permitido_l),
        excesoL: Number(f.exceso_l),
        precioPromedio: num(f.precio_promedio),
        precioPropuesto: num(f.precio_propuesto),
        moneda: f.moneda,
        importe: num(f.importe),
        cierre:
          f.cierre_id === null
            ? null
            : {
                id: f.cierre_id,
                numero: f.cierre_numero ?? '',
                justificadoL: Number(f.cierre_justificado_l ?? 0),
                excesoL: Number(f.cierre_exceso_l ?? 0),
                precio: num(f.cierre_precio),
                importe: num(f.cierre_importe),
              },
      }));
    },

    async cerrar(d: CerrarRalenti): Promise<number> {
      const { data, error } = await fue().rpc('fn_cerrar_ralenti', {
        p_chofer: d.choferId,
        p_mes: d.mes,
        p_justificado_l: d.justificadoL,
        p_motivo_justificado: d.motivoJustificado,
        p_precio_litro: d.precioLitro,
        p_observacion: d.observacion,
      });
      if (error) throw new RepoError(error);
      return data;
    },

    async anular(cierreId: number, motivo: string): Promise<void> {
      const { error } = await fue().rpc('fn_anular_cierre_ralenti', { p_cierre: cierreId, p_motivo: motivo });
      if (error) throw new RepoError(error);
    },
  };
};
