import { RepoError, type Db } from '@/shared/repository/types';
import type { FechaISO } from '@/shared/types/dominio';
import type { AgregarGasto } from '../domain/costos.schemas';
import { parsearCostosViaje, type CostosViaje, type CostoViajeFila } from '../domain/costos.types';

const n = (v: number | string | null | undefined) => (v === null || v === undefined ? null : Number(v));

/** Km reales y costos de los viajes de chofer (migración 51). Todo lo calcula la base. */
export const costosRepository = (db: Db) => {
  const ops = () => db.schema('ops');
  return {
    async deViaje(viajeId: number): Promise<CostosViaje> {
      const { data, error } = await ops().rpc('fn_costos_viaje', { p_viaje: viajeId });
      if (error) throw new RepoError(error);
      return parsearCostosViaje(data);
    },

    async lista(desde: string, hasta: string): Promise<CostoViajeFila[]> {
      const { data, error } = await ops().rpc('fn_costos_viajes', { p_desde: desde, p_hasta: hasta });
      if (error) throw new RepoError(error);
      return (data ?? []).map((f) => ({
        viajeId: f.viaje_id,
        numero: f.numero,
        estado: f.estado,
        salida: f.salida_ts as FechaISO,
        llegada: f.llegada_ts as FechaISO | null,
        patente: f.patente,
        chofer: f.chofer,
        kmLinea: n(f.km_linea),
        kmReales: n(f.km_reales),
        litros: n(f.litros),
        combustible: n(f.combustible),
        canon: n(f.canon),
        costoKm: n(f.costo_km),
        gastos: n(f.gastos),
        total: Number(f.total),
        porKm: n(f.por_km),
        operaciones: f.operaciones,
        moneda: f.moneda,
        enCurso: f.en_curso,
        incompleto: f.incompleto,
      }));
    },

    async categorias(): Promise<{ codigo: string; nombre: string }[]> {
      const { data, error } = await ops().rpc('fn_categorias_gasto_viaje');
      if (error) throw new RepoError(error);
      return data ?? [];
    },

    async agregarGasto(d: AgregarGasto): Promise<number> {
      const { data, error } = await ops().rpc('fn_agregar_gasto_viaje', {
        p_viaje: d.viajeId,
        p_categoria: d.categoria,
        p_fecha: d.fecha,
        p_importe: d.importe,
        p_moneda: d.moneda,
        p_documento: d.documento,
        p_observacion: d.observacion,
      });
      if (error) throw new RepoError(error);
      return data;
    },

    async anularGasto(gastoId: number, motivo: string): Promise<void> {
      const { error } = await ops().rpc('fn_anular_gasto_viaje', { p_gasto: gastoId, p_motivo: motivo });
      if (error) throw new RepoError(error);
    },
  };
};
