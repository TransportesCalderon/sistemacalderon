/**
 * Migración 306 · Notificaciones del teléfono que la persona todavía no abrió. Quedan pendientes hasta que se tocan en
 * el teléfono o se abren en el sistema (la campana de arriba y «Notificaciones sin revisar» del inicio).
 */
export const VERSION_NOTIFICACIONES = 306;

export interface Notificacion {
  id: number;
  titulo: string;
  cuerpo: string | null;
  /** La pantalla a la que lleva (la misma que abre la notificación en el teléfono). */
  url: string;
  urgente: boolean;
  creadaEn: string;
}

export interface MisNotificaciones {
  /** Cuántas hay sin abrir (puede ser más que las de la lista). */
  pendientes: number;
  /** Las más nuevas primero. */
  lista: Notificacion[];
}

type J = Record<string, unknown>;
const o = (v: unknown): J => (v && typeof v === 'object' && !Array.isArray(v) ? (v as J) : {});
const t = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

/** Solo pantallas del propio sistema (la base las arma; nunca un sitio de afuera). */
export const urlInterna = (v: unknown): string => (typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') ? v : '/');

export const parsearNotificaciones = (d: unknown): MisNotificaciones => {
  const x = o(d);
  const lista = (Array.isArray(x.lista) ? (x.lista as unknown[]) : []).map(o).map((n) => ({
    id: Number(n.id),
    titulo: t(n.titulo) ?? 'IronTrack',
    cuerpo: t(n.cuerpo),
    url: urlInterna(n.url),
    urgente: n.urgente === true,
    creadaEn: t(n.creado_en) ?? '',
  }));
  const pendientes = Number(x.pendientes);
  return { pendientes: Number.isFinite(pendientes) && pendientes > 0 ? Math.trunc(pendientes) : 0, lista: lista.filter((n) => n.id > 0) };
};

/** «1 notificación sin revisar» / «3 notificaciones sin revisar». */
export const textoPendientes = (n: number): string => (n === 1 ? '1 notificación sin revisar' : `${n} notificaciones sin revisar`);

/** Lo que va en el círculo rojo: hasta 99. */
export const numeroInsignia = (n: number): string => (n > 99 ? '99+' : String(n));
