import { RepoError, type Db } from '@/shared/repository/types';
import type { Json } from '@/shared/types/database.generated';
import { parsearPlanCaja, type AjustePlanEntrada, type CerrarPartidaEntrada, type OpcionesPlan, type PartidaCajaEntrada, type PlanCaja } from '../domain/plan-caja';
import { parsearRepartoCaja, type MoraCajaEntrada, type OpcionesReparto, type ReglasRepartoEntrada, type RepartoCaja } from '../domain/reparto-caja';

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
    /**
     * Migración 368 · «¿Qué hacemos con la plata?»: la propuesta de reparto; null si la base todavía no la tiene.
     * Con «prueba» se arma con otras reglas sin guardarlas.
     */
    async reparto(o: OpcionesReparto): Promise<RepartoCaja | null> {
      const { data, error } = await fin().rpc('fn_plan_caja_reparto', {
        p_opciones: {
          entra: o.entra,
          entra_moneda: o.entraMoneda,
          usar_caja: o.usarCaja,
          ...(o.prueba ? { orden: o.prueba.orden, espalda: o.prueba.espalda, reserva_sueldos_dias: o.prueba.reservaSueldosDias, cuotas_dias: o.prueba.cuotasDias } : {}),
        },
      });
      if (error) {
        if (FUNCION_INEXISTENTE.has((error as { code?: string }).code ?? '')) return null;
        throw new RepoError(error);
      }
      return parsearRepartoCaja(data);
    },
    /** Las reglas del reparto: el orden de los pasos, la espalda y los días de sueldos y de cuotas. */
    async guardarReglas(d: ReglasRepartoEntrada): Promise<void> {
      const { error } = await fin().rpc('fn_plan_caja_reglas_guardar', {
        p_datos: { orden: d.orden, espalda: d.espalda, reserva_sueldos_dias: d.reservaSueldosDias, cuotas_dias: d.cuotasDias } as Json,
      });
      if (error) throw new RepoError(error);
    },
    /**
     * Lo que se sabe de un acreedor (contrato, proveedor, deuda a mano o gasto suelto): cuánto cobra de interés por mes
     * si se le paga tarde y, desde la migración 369, la marca «pagar primero». Sin interés y sin marca, la base lo borra.
     */
    async guardarMora(d: MoraCajaEntrada): Promise<void> {
      const { error } = await fin().rpc('fn_plan_caja_mora_guardar', {
        p_tipo: d.tipo,
        p_id: d.id,
        p_datos: { tasa_mensual: d.tasaMensual, pagar_primero: d.pagarPrimero, nota: d.nota } as Json,
      });
      if (error) throw new RepoError(error);
    },
    /** Ya se cumplió (entró o se pagó), no va más, o volver a abrirla. */
    async cerrarPartida(d: CerrarPartidaEntrada): Promise<void> {
      const { error } = await fin().rpc('fn_cerrar_partida_caja', { p_id: d.id, p_accion: d.accion, ...(d.fecha ? { p_fecha: d.fecha } : {}) });
      if (error) throw new RepoError(error);
    },
  };
}
