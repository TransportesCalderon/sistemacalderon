import type { CamionId, CargaId, CierreViajeId, FechaISO } from '@/shared/types/dominio';
import { esSituacionViaje, type SituacionViaje } from './viaje.types';
import { FECHA_DIA, idDe, leerParam, type EntradaUrl } from './comun';

/**
 * Control del consumo (migración 36). La base calcula todo: cargado (libro del camión),
 * consumo del motor (contador de la telemetría), diferencia, km, L/100 km y costos.
 */
export interface ViajeConciliado {
  camionId: CamionId;
  patente: string;
  cargaSalidaId: CargaId;
  salidaTs: FechaISO;
  llegadaTs: FechaISO;
  situacion: SituacionViaje;
  cierreId: CierreViajeId | null;
  cierreNumero: string | null;
  cargadoL: number | null;
  consumoMotorL: number | null;
  fuenteConsumo: string | null;
  /** Cargado − motor: positiva = falta combustible. */
  diferenciaL: number | null;
  toleranciaL: number | null;
  km: number | null;
  fuenteKm: string | null;
  l100Cargado: number | null;
  l100Motor: number | null;
  pendientes: number;
}

export interface ConsumoCamion {
  camionId: CamionId;
  patente: string;
  codigoInterno: string;
  cargas: number;
  litrosCargados: number;
  importeBase: number | null;
  monedaBase: string | null;
  costoLitro: number | null;
  km: number | null;
  fuenteKm: string | null;
  consumoMotorL: number | null;
  l100Motor: number | null;
  l100Cargado: number | null;
  costoKm: number | null;
  ultimaLectura: FechaISO | null;
}

export interface PeriodoParams {
  desde: string;
  hasta: string;
  camionId?: number;
}

export const fueraDeTolerancia = (v: Pick<ViajeConciliado, 'diferenciaL' | 'toleranciaL'>) =>
  v.diferenciaL !== null && v.toleranciaL !== null && Math.abs(v.diferenciaL) > v.toleranciaL;

export const situacionDe = (s: string | null): SituacionViaje => (esSituacionViaje(s) ? s : 'sin_cierre');

/** Período de la URL; por defecto, el mes en curso hasta hoy. */
export function parsearPeriodo(e: EntradaUrl, hoy: string): PeriodoParams {
  const desde = leerParam(e, 'desde');
  const hasta = leerParam(e, 'hasta');
  const p: PeriodoParams = {
    desde: desde && FECHA_DIA.test(desde) ? desde : `${hoy.slice(0, 8)}01`,
    hasta: hasta && FECHA_DIA.test(hasta) ? hasta : hoy,
  };
  const camion = idDe(e, 'camion');
  if (camion) p.camionId = camion;
  return p;
}

export function serializarPeriodo(p: PeriodoParams): string {
  const u = new URLSearchParams({ desde: p.desde, hasta: p.hasta });
  if (p.camionId !== undefined) u.set('camion', String(p.camionId));
  return u.toString();
}
