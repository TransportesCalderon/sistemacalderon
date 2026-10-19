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

/** Patente al principio del nombre de la API («SRYR 55 // CHOFER», «SHXB49 | CHOFER»), sin espacios. */
export function patenteDeNombre(nombre: string | null): string | null {
  const p =
    (nombre ?? '')
      .split(/[/|]/)[0]
      ?.toUpperCase()
      .replace(/[^A-Z0-9]/g, '') ?? '';
  return p.length >= 5 && p.length <= 8 ? p : null;
}

/** País probable de la patente: Chile (BBBB12 o BB1234) o Argentina (AA123BB o ABC123). Se puede cambiar en el alta. */
export function paisDePatente(patente: string | null): 'CL' | 'AR' | null {
  if (!patente) return null;
  if (/^[A-Z]{4}\d{2}$/.test(patente) || /^[A-Z]{2}\d{4}$/.test(patente)) return 'CL';
  if (/^[A-Z]{2}\d{3}[A-Z]{2}$/.test(patente) || /^[A-Z]{3}\d{3}$/.test(patente)) return 'AR';
  return null;
}

const MARCA: Record<string, string> = { renault: 'Renault Trucks', volvo: 'Volvo' };

/** Enlace al alta de camión con los datos de la API. */
export function enlaceAlta(v: VehiculoApi): string {
  const patente = patenteDeNombre(v.nombre);
  const u = new URLSearchParams({ vin: v.vin });
  if (patente) u.set('patente', patente);
  const pais = paisDePatente(patente);
  if (pais) u.set('pais', pais);
  if (MARCA[v.marca]) u.set('marca', MARCA[v.marca]!);
  if (v.modelo) u.set('modelo', v.modelo);
  return `/flota/camiones/nuevo?${u.toString()}`;
}
