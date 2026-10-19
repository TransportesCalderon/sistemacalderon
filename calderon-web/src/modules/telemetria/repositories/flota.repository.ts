import { RepoError, type Db } from '@/shared/repository/types';
import type { FechaISO } from '@/shared/types/dominio';
import type { CamionEnVivo, CorridaApi, VehiculoApi } from '../domain/flota.types';

const n = (v: number | string | null | undefined) => (v === null || v === undefined ? null : Number(v));

/** Lecturas de telemetría (vistas de la migración 32). La importación la hace la base. */
export const flotaRepository = (db: Db) => ({
  async enVivo(): Promise<CamionEnVivo[]> {
    const { data, error } = await db.schema('tel').from('v_flota_actual').select('*').order('patente');
    if (error) throw new RepoError(error);
    return data.map((f) => ({
      camionId: f.camion_id ?? 0,
      codigoInterno: f.codigo_interno ?? '',
      patente: f.patente ?? '',
      marca: f.marca,
      nombreApi: f.nombre_api,
      ts: f.ts as FechaISO | null,
      latitud: n(f.latitud),
      longitud: n(f.longitud),
      velocidadKmh: n(f.velocidad_kmh),
      rumbo: n(f.rumbo_grados),
      odometroKm: n(f.odometro_km),
      nivelPct: n(f.nivel_combustible_pct),
      nivelL: n(f.nivel_combustible_l),
      motorEncendido: f.motor_encendido,
    }));
  },

  async vehiculosApi(): Promise<VehiculoApi[]> {
    const { data, error } = await db
      .schema('tel')
      .from('v_vehiculo_api')
      .select('marca, vin, nombre, modelo, camion_id, patente')
      .order('nombre');
    if (error) throw new RepoError(error);
    return data.map((v) => ({
      marca: v.marca ?? '',
      vin: v.vin ?? '',
      nombre: v.nombre,
      modelo: v.modelo,
      camionId: v.camion_id,
      patente: v.patente,
    }));
  },

  /** Últimas corridas de la importación (solo TI puede leer el registro). */
  async corridas(): Promise<CorridaApi[]> {
    const { data, error } = await db
      .schema('tel')
      .from('registro_api')
      .select('id, ejecutado_en, marca, operacion, ok, detalle')
      .order('id', { ascending: false })
      .limit(10);
    if (error) throw new RepoError(error);
    return data.map((c) => ({
      id: c.id,
      ejecutadoEn: c.ejecutado_en as FechaISO,
      marca: c.marca,
      operacion: c.operacion,
      ok: c.ok,
      detalle: c.detalle,
    }));
  },

  /** Importa ahora todas las marcas con credenciales (Renault, Volvo). */
  async importarAhora(): Promise<unknown> {
    const { data, error } = await db.schema('tel').rpc('fn_importar_todas', { p_origen: 'manual' });
    if (error) throw new RepoError(error);
    return data;
  },
});
