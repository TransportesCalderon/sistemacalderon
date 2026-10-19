import { RepoError, type Db } from '@/shared/repository/types';
import type { CamionId, CargaId, CierreViajeId, FechaISO } from '@/shared/types/dominio';
import { situacionDe, type ConsumoCamion, type PeriodoParams, type ViajeConciliado } from '../domain/consumo.types';

const n = (v: number | string | null | undefined) => (v === null || v === undefined ? null : Number(v));

/** Tableros de control del consumo (funciones de la migración 36). */
export const consumoRepository = (db: Db) => ({
  async viajes(p: PeriodoParams): Promise<ViajeConciliado[]> {
    const { data, error } = await db
      .schema('fue')
      .rpc('fn_conciliacion_viajes', { p_desde: p.desde, p_hasta: p.hasta, p_camion: p.camionId ?? null });
    if (error) throw new RepoError(error);
    return (data ?? []).map((v) => ({
      camionId: v.camion_id as CamionId,
      patente: v.patente,
      cargaSalidaId: v.carga_salida_id as CargaId,
      salidaTs: v.salida_ts as FechaISO,
      llegadaTs: v.llegada_ts as FechaISO,
      situacion: situacionDe(v.situacion),
      cierreId: v.cierre_id as CierreViajeId | null,
      cierreNumero: v.cierre_numero,
      cargadoL: n(v.cargado_l),
      consumoMotorL: n(v.consumo_motor_l),
      fuenteConsumo: v.fuente_consumo,
      diferenciaL: n(v.diferencia_l),
      toleranciaL: n(v.tolerancia_l),
      km: n(v.km),
      fuenteKm: v.fuente_km,
      l100Cargado: n(v.l_100km_cargado),
      l100Motor: n(v.l_100km_motor),
      pendientes: v.pendientes ?? 0,
    }));
  },

  async camiones(p: PeriodoParams): Promise<ConsumoCamion[]> {
    const { data, error } = await db.schema('fue').rpc('fn_consumo_camiones', { p_desde: p.desde, p_hasta: p.hasta });
    if (error) throw new RepoError(error);
    return (data ?? []).map((c) => ({
      camionId: c.camion_id as CamionId,
      patente: c.patente,
      codigoInterno: c.codigo_interno,
      cargas: c.cargas,
      litrosCargados: Number(c.litros_cargados),
      importeBase: n(c.importe_base),
      monedaBase: c.moneda_base,
      costoLitro: n(c.costo_litro),
      km: n(c.km),
      fuenteKm: c.fuente_km,
      consumoMotorL: n(c.consumo_motor_l),
      l100Motor: n(c.l_100km_motor),
      l100Cargado: n(c.l_100km_cargado),
      costoKm: n(c.costo_km),
      ultimaLectura: c.ultima_lectura as FechaISO | null,
    }));
  },
});
