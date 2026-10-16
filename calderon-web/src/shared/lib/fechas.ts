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

/**
 * Hora de pared en una zona ('AAAA-MM-DDTHH:mm', valor de <input type="datetime-local">) → ISO UTC.
 * Resuelve el desfase de la zona en ese instante (horario de verano incluido). null si no es válida.
 */
export function horaLocalAIso(valor: string, zona: string): FechaISO | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(valor);
  if (!m) return null;
  const [a, mes, d, h, min] = m.slice(1).map(Number) as [number, number, number, number, number];
  const comoUtc = Date.UTC(a, mes - 1, d, h, min);
  const desfase = (instante: number) => {
    const p = new Intl.DateTimeFormat('en-US', {
      timeZone: zona, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(instante));
    const v = (t: string) => Number(p.find((x) => x.type === t)?.value);
    return Date.UTC(v('year'), v('month') - 1, v('day'), v('hour'), v('minute')) - instante;
  };
  let instante = comoUtc - desfase(comoUtc);
  instante = comoUtc - desfase(instante);
  const fecha = new Date(instante);
  return Number.isNaN(fecha.getTime()) ? null : (fecha.toISOString() as FechaISO);
}

/** ISO UTC → 'AAAA-MM-DDTHH:mm' en la zona (valor inicial de un <input type="datetime-local">). */
export function isoAHoraLocal(iso: FechaISO | string, zona: string): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: zona, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(iso));
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? '00';
  return `${v('year')}-${v('month')}-${v('day')}T${v('hour')}:${v('minute')}`;
}
