import { RepoError, type Db } from '@/shared/repository/types';
import type { Json } from '@/shared/types/database.generated';

/** Cierres por hacer (migración 63): la base dice en qué etapa está cada viaje y qué falta. */
export type EtapaCierre = 'listo' | 'con_diferencia' | 'faltan_datos' | 'en_viaje';

export interface ViajePorCerrar {
  /** null: viaje terminado que no tiene viaje de chofer (migración 133); se cierra armando su cierre. */
  viajeId: number | null;
  numero: string;
  version: number;
  estadoViaje: 'abierto' | 'cerrado';
  camionId: number;
  patente: string;
  chofer: string | null;
  salida: string;
  llegada: string | null;
  dias: number | null;
  etapa: EtapaCierre;
  faltan: string[];
  /** Migración 82: lo que falta del viaje del chofer (operaciones, canon, km). No frena el cierre de combustible. */
  faltanViaje: string[];
  operacionesParaAgregar: number;
  cierreId: number | null;
  cierreNumero: string | null;
  aDescontarL: number | null;
  diferenciaL: number | null;
  toleranciaL: number | null;
  km: number | null;
  consumoL: number | null;
  /** Migración 133: carga de salida, horas desde la llegada y si pasó el plazo para cerrar. */
  cargaSalidaId: number | null;
  horas: number | null;
  vencido: boolean;
  plazoHoras: number | null;
  sinViajeChofer: boolean;
}

type Obj = Record<string, unknown>;
const n = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));
const s = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

export const parsearPorCerrar = (v: Json | unknown): ViajePorCerrar[] =>
  (Array.isArray(v) ? v : []).map((x) => {
    const o = (x ?? {}) as Obj;
    return {
      viajeId: n(o.viaje_id),
      numero: s(o.numero) ?? '',
      version: n(o.version) ?? 1,
      estadoViaje: o.estado_viaje === 'cerrado' ? 'cerrado' : 'abierto',
      camionId: Number(o.camion_id),
      patente: s(o.patente) ?? '',
      chofer: s(o.chofer),
      salida: s(o.salida) ?? '',
      llegada: s(o.llegada),
      dias: n(o.dias),
      etapa: (s(o.etapa) ?? 'faltan_datos') as EtapaCierre,
      faltan: Array.isArray(o.faltan) ? o.faltan.map(String) : [],
      faltanViaje: Array.isArray(o.faltan_viaje) ? o.faltan_viaje.map(String) : [],
      operacionesParaAgregar: n(o.operaciones_para_agregar) ?? 0,
      cierreId: n(o.cierre_id),
      cierreNumero: s(o.cierre_numero),
      aDescontarL: n(o.a_descontar_l),
      diferenciaL: n(o.diferencia_l),
      toleranciaL: n(o.tolerancia_l),
      km: n(o.km),
      consumoL: n(o.consumo_l),
      cargaSalidaId: n(o.carga_salida_id),
      horas: n(o.horas),
      vencido: o.vencido === true,
      plazoHoras: n(o.plazo_horas),
      sinViajeChofer: o.sin_viaje_chofer === true,
    };
  });

export const porCerrarRepository = (db: Db) => {
  const ops = () => db.schema('ops');
  return {
    async lista(dias = 120): Promise<ViajePorCerrar[]> {
      const { data, error } = await ops().rpc('fn_cierres_por_hacer', { p_dias: dias });
      if (error) throw new RepoError(error);
      return parsearPorCerrar(data);
    },
    async aprobarVarios(viajes: number[]) {
      const { data, error } = await ops().rpc('fn_cerrar_y_aprobar_varios', { p_viajes: viajes });
      if (error) throw new RepoError(error);
      const r = (data ?? {}) as { aprobados?: number; errores?: { viaje: string | null; error: string }[] };
      return { aprobados: r.aprobados ?? 0, errores: r.errores ?? [] };
    },
    /** Migración 134: el viaje del chofer de un viaje ya terminado (o el que ya tiene), para cargarle operaciones y línea. */
    async crearViajePasado(cargaSalidaId: number): Promise<number> {
      const { data, error } = await ops().rpc('fn_crear_viaje_pasado', { p_carga_salida: cargaSalidaId });
      if (error) throw new RepoError(error);
      return Number(data);
    },
    async completarOperaciones(viaje: number): Promise<number> {
      const { data, error } = await ops().rpc('fn_completar_operaciones_viaje', { p_viaje: viaje });
      if (error) throw new RepoError(error);
      return data ?? 0;
    },
  };
};
