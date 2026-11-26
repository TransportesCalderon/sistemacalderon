import { RepoError, type Db } from '@/shared/repository/types';
import type { Json } from '@/shared/types/database.generated';
import { parsearPlanCaja, type AjustePlanEntrada, type CerrarPartidaEntrada, type OpcionesPlan, type PartidaCajaEntrada, type PlanCaja } from '../domain/plan-caja';

/** La base todavía no tiene la migración 367 (la función no existe). */
const FUNCION_INEXISTENTE = new Set(['PGRST202', '42883']);

/** Migración 367 · Planificador de caja. La base arma el plan y valida todo; su mensaje se muestra tal cual. */
export function planCajaRepository(db: Db) {
  const fin = () => db.schema('fin');
  return {
    /** El plan; null si la base todavía no lo tiene. */
    async leer(o: OpcionesPlan): Promise<PlanCaja | null> {
      const { data, error } = await fin().rpc('fn_plan_caja', {
        p_opciones: { moneda: o.moneda, semanas: o.semanas, con_viajes: o.conViajes, con_dudosas: o.conDudosas },
      });
      if (error) {
        if (FUNCION_INEXISTENTE.has((error as { code?: string }).code ?? '')) return null;
        throw new RepoError(error);
      }
      return parsearPlanCaja(data);
    },
    /** Fecha esperada, si se cuenta y qué tan segura es una partida que sale del sistema. Todo vacío = volver a lo automático. */
    async ajustar(d: AjustePlanEntrada): Promise<void> {
      const { error } = await fin().rpc('fn_plan_caja_ajustar', {
        p_origen: d.origen,
        p_id: d.id,
        p_datos: { fecha: d.fecha, contar: d.contar, certeza: d.certeza, nota: d.nota } as Json,
      });
      if (error) throw new RepoError(error);
    },
    /** Alta o cambio de una entrada o salida prevista. Devuelve los ids (varios si se repite). */
    async guardarPartida(d: PartidaCajaEntrada): Promise<number[]> {
      const { data, error } = await fin().rpc('fn_guardar_partida_caja', {
        p_id: d.id as number,
        p_datos: {
          tipo: d.tipo,
          categoria: d.categoria,
          descripcion: d.descripcion,
          tercero: d.tercero,
          fecha: d.fecha,
          moneda: d.moneda,
          monto: d.monto,
          certeza: d.certeza,
          nota: d.nota,
          version: d.version,
          repetir: d.repetir,
        } as Json,
      });
      if (error) throw new RepoError(error);
      const ids = (data as { ids?: unknown } | null)?.ids;
      return Array.isArray(ids) ? ids.map(Number) : [];
    },
    /** Ya se cumplió (entró o se pagó), no va más, o volver a abrirla. */
    async cerrarPartida(d: CerrarPartidaEntrada): Promise<void> {
      const { error } = await fin().rpc('fn_cerrar_partida_caja', { p_id: d.id, p_accion: d.accion, ...(d.fecha ? { p_fecha: d.fecha } : {}) });
      if (error) throw new RepoError(error);
    },
  };
}
