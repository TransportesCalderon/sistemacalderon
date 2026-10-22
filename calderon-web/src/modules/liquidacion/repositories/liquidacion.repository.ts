import { RepoError, type Db } from '@/shared/repository/types';
import { parsearConceptos, parsearLiquidacion, parsearPeriodo, parsearTarifas } from '../domain/liquidacion.types';
import type { ConceptoEntrada, RenglonEntrada, TarifaEntrada } from '../domain/liquidacion.schemas';

/** Liquidaciones (migración 62). Todo pasa por funciones de la base; su mensaje se muestra tal cual. */
export const liquidacionRepository = (db: Db) => {
  const fin = () => db.schema('fin');
  const leer = async <T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> => {
    const { data, error } = await p;
    if (error) throw new RepoError(error as never);
    return data as T;
  };
  return {
    async periodo(periodo: string) {
      return parsearPeriodo(await leer(fin().rpc('fn_liquidaciones', { p_periodo: periodo })));
    },
    async liquidacion(id: number) {
      return parsearLiquidacion(await leer(fin().rpc('fn_liquidacion', { p_liq: id })));
    },
    async mias() {
      const v = await leer(fin().rpc('fn_mis_liquidaciones'));
      return (Array.isArray(v) ? v : []).map(parsearLiquidacion);
    },
    async tarifas() {
      return parsearTarifas(await leer(fin().rpc('fn_tarifas')));
    },
    async conceptos() {
      return parsearConceptos(await leer(fin().rpc('fn_conceptos_liquidacion')));
    },

    async guardarTarifa(t: TarifaEntrada): Promise<number> {
      return leer(
        fin().rpc('fn_guardar_tarifa', {
          p_chofer: t.choferId,
          p_desde: t.desde,
          p_sueldo_fijo: t.sueldoFijo,
          p_precio_km: t.precioKm,
          p_observacion: t.observacion,
        }),
      );
    },
    async quitarTarifa(id: number) {
      await leer(fin().rpc('fn_quitar_tarifa', { p_tarifa: id }));
    },
    async guardarConcepto(c: ConceptoEntrada): Promise<number> {
      return leer(
        fin().rpc('fn_guardar_concepto', {
          p_id: c.id,
          p_codigo: c.codigo,
          p_nombre: c.nombre,
          p_tipo: c.tipo,
          p_calculo: c.calculo,
          p_valor: c.valor,
          p_base: c.base,
          p_automatico: c.automatico,
          p_activo: c.activo,
          p_orden: c.orden,
        }),
      );
    },
    async preparar(choferId: number, periodo: string): Promise<number> {
      return leer(fin().rpc('fn_preparar_liquidacion', { p_chofer: choferId, p_periodo: periodo }));
    },
    async prepararTodas(periodo: string) {
      const r = (await leer(fin().rpc('fn_preparar_liquidaciones', { p_periodo: periodo }))) as {
        preparadas?: number;
        errores?: { chofer: string; error: string }[];
      } | null;
      return { preparadas: r?.preparadas ?? 0, errores: r?.errores ?? [] };
    },
    async agregarRenglon(r: RenglonEntrada): Promise<number> {
      return leer(
        fin().rpc('fn_agregar_renglon', {
          p_liq: r.liquidacionId,
          p_tipo: r.tipo,
          p_descripcion: r.descripcion,
          p_importe: r.importe as number,
          p_concepto: r.conceptoId,
        }),
      );
    },
    async quitarRenglon(id: number) {
      await leer(fin().rpc('fn_quitar_renglon', { p_renglon: id }));
    },
    async aprobar(id: number, version: number) {
      await leer(fin().rpc('fn_aprobar_liquidacion', { p_liq: id, p_version: version }));
    },
    async pagar(id: number, fecha: string, forma: string | null) {
      await leer(fin().rpc('fn_pagar_liquidacion', { p_liq: id, p_fecha: fecha, p_forma: forma }));
    },
    async reabrir(id: number, motivo: string) {
      await leer(fin().rpc('fn_reabrir_liquidacion', { p_liq: id, p_motivo: motivo }));
    },
    async anular(id: number, motivo: string) {
      await leer(fin().rpc('fn_anular_liquidacion', { p_liq: id, p_motivo: motivo }));
    },
  };
};
