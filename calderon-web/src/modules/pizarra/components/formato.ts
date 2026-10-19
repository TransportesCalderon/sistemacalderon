import type { Alerta } from '../domain/pizarra.types';

/** «19/10 14:30» en la zona de la operación. */
export function diaHora(iso: string | null, zona: string): string {
  if (!iso) return '—';
  const p = new Intl.DateTimeFormat('es-AR', {
    timeZone: zona,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${v('day')}/${v('month')} ${v('hour')}:${v('minute')}`;
}

/** «19/10». */
export function diaCorto(iso: string | null, zona: string): string {
  if (!iso) return '—';
  const p = new Intl.DateTimeFormat('es-AR', { timeZone: zona, day: '2-digit', month: '2-digit' }).formatToParts(new Date(iso));
  return `${p.find((x) => x.type === 'day')?.value}/${p.find((x) => x.type === 'month')?.value}`;
}

/** 'AAAA-MM-DD' → «12/09». */
export const diaDeFecha = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '—');

/** «hace 3 h», «hace 2 d». */
export function hace(iso: string | null, ahora: number = Date.now()): string {
  if (!iso) return '';
  const min = Math.max(0, Math.round((ahora - new Date(iso).getTime()) / 60_000));
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`;
}

/** Alerta de la fila con alguno de esos códigos (la más grave primero). */
export function alertaDe(alertas: Alerta[], ...codigos: string[]): Alerta | undefined {
  const a = alertas.filter((x) => codigos.includes(x.codigo));
  return a.find((x) => x.nivel === 'critico') ?? a[0];
}

/** Clase de texto según la alerta de la celda: rojo si es crítica, ámbar si es aviso. */
export const claseAlerta = (a: Alerta | undefined) => (!a ? '' : a.nivel === 'critico' ? 'font-semibold text-error' : 'text-alerta');
