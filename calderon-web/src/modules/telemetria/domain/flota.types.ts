import type { FechaISO } from '@/shared/types/dominio';

/**
 * Telemetría (migraciones 31 y 32): la base trae cada 10 minutos el último estado de cada
 * camión por la API rFMS (Renault; después Volvo) y lo guarda como lectura. Acá solo se muestra.
 */
export interface CamionEnVivo {
  camionId: number;
  codigoInterno: string;
  patente: string;
  marca: string | null;
  nombreApi: string | null;
  ts: FechaISO | null;
  latitud: number | null;
  longitud: number | null;
  velocidadKmh: number | null;
  rumbo: number | null;
  odometroKm: number | null;
  nivelPct: number | null;
  nivelL: number | null;
  motorEncendido: boolean | null;
}

export interface VehiculoApi {
  marca: string;
  vin: string;
  nombre: string | null;
  modelo: string | null;
  camionId: number | null;
  patente: string | null;
}

export interface CorridaApi {
  id: number;
  ejecutadoEn: FechaISO;
  marca: string;
  operacion: string;
  ok: boolean;
  detalle: string | null;
}

/** Minutos desde la última lectura (para mostrar «hace 12 min»). */
export function minutosDesde(ts: string | null, ahora: number = Date.now()): number | null {
  if (!ts) return null;
  const t = new Date(ts).getTime();
  return Number.isNaN(t) ? null : Math.max(0, Math.round((ahora - t) / 60_000));
}

export function haceTexto(min: number | null): string {
  if (min === null) return 'sin datos';
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} días`;
}

/** Estado de la señal: en vivo (≤ 30 min), demorada (≤ 24 h) o sin señal. */
export type Senal = 'vivo' | 'demorada' | 'sin_senal';
export function senalDe(min: number | null): Senal {
  if (min === null || min > 24 * 60) return 'sin_senal';
  return min <= 30 ? 'vivo' : 'demorada';
}
