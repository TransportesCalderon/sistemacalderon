import type { FechaDia, FechaISO } from '@/shared/types/dominio';

/**
 * Formato de fechas (especificación §1: se guarda en UTC, se muestra en la zona elegida).
 * Única puerta para mostrar FechaISO / FechaDia en la interfaz.
 */

/** timestamptz → "13/10/2026 14:05" en la zona indicada. */
export function formatearFechaHora(iso: FechaISO | string | null | undefined, zona: string): string {
  if (!iso) return '—';
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '—';
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: zona,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(fecha);
}

/** date 'AAAA-MM-DD' → "13/10/2026". No pasa por Date: un día calendario no tiene zona. */
export function formatearFechaDia(dia: FechaDia | string | null | undefined): string {
  if (!dia) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
}

/** Fecha de hoy ('AAAA-MM-DD') en la zona indicada; valor por defecto de campos date. */
export function hoyEnZona(zona: string, ahora: Date = new Date()): FechaDia {
  // en-CA formatea como AAAA-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    ahora,
  ) as FechaDia;
}

/** ¿Es un date válido 'AAAA-MM-DD' (incluye validar el día del mes)? */
export function esFechaDiaValida(valor: string): valor is FechaDia {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (!m) return false;
  const [a, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const f = new Date(Date.UTC(a, mes - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === mes - 1 && f.getUTCDate() === d;
}
