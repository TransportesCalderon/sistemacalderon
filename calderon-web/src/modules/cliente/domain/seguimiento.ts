/**
 * Migración 288 · Usuario de un cliente: entra solo a su seguimiento, el mapa con los camiones que llevan
 * su carga (desde que se retira hasta que se entrega). La base arma todo (public.fn_mapa_cliente, con el
 * cliente del usuario); acá solo se lee y se muestra.
 */

/** La única pantalla del usuario de un cliente. */
export const RUTA_CLIENTE = '/seguimiento';

/**
 * Adónde va el usuario de un cliente que pide `pathname`: null si puede quedarse.
 * Todo lo demás lo manda a su seguimiento; el perfil (adonde vuelve «¿Olvidaste tu contraseña?»)
 * abre ahí el cambio de contraseña.
 */
export function destinoDelCliente(pathname: string): string | null {
  const en = (ruta: string) => pathname === ruta || pathname.startsWith(`${ruta}/`);
  if (en(RUTA_CLIENTE) || en('/sin-acceso')) return null;
  if (en('/perfil')) return `${RUTA_CLIENTE}?clave=1`;
  return RUTA_CLIENTE;
}

/** Un camión (o el semi solo, en un relevo) con carga del cliente. */
export interface UnidadCliente {
  /** La operación de Operaciones. */
  id: number;
  tractor: string | null;
  semi: string | null;
  chofer: string | null;
  contenedor: string | null;
  referencia: string | null;
  /** Relevo: el semi quedó en una base o en la aduana, sin tractor ni chofer. */
  enBase: boolean;
  /** Dónde quedó el semi (solo en un relevo). */
  lugar: string | null;
  lat: number | null;
  lng: number | null;
  /** Hora de la última posición (o de cuando quedó en la base). */
  ts: string | null;
}

/** Lo que devuelve la base: el nombre del cliente, cuándo se consultó y sus unidades. */
export interface Seguimiento {
  cliente: string | null;
  consultado: string | null;
  unidades: UnidadCliente[];
}

type Obj = Record<string, unknown>;
const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
const numN = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Lee la respuesta de public.fn_mapa_cliente(). */
export function leerSeguimiento(raw: unknown): Seguimiento {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Obj;
  const lista = Array.isArray(o.unidades) ? (o.unidades as unknown[]) : [];
  return {
    cliente: txt(o.cliente),
    consultado: txt(o.consultado),
    unidades: lista
      .filter((u): u is Obj => !!u && typeof u === 'object')
      .map((u) => ({
        id: Number(u.id),
        tractor: txt(u.tractor),
        semi: txt(u.semi),
        chofer: txt(u.chofer),
        contenedor: txt(u.contenedor),
        referencia: txt(u.referencia),
        enBase: u.en_base === true,
        lugar: txt(u.lugar),
        lat: numN(u.lat),
        lng: numN(u.lng),
        ts: txt(u.ts),
      })),
  };
}

/** Si tiene lugar en el mapa. */
export const tienePosicion = (u: UnidadCliente): u is UnidadCliente & { lat: number; lng: number } => u.lat !== null && u.lng !== null;

/** «AB123CD» (el tractor) o, en un relevo, «Semi XY456». */
export function tituloUnidad(u: UnidadCliente): string {
  if (!u.enBase && u.tractor) return u.tractor;
  return u.semi ? `Semi ${u.semi}` : 'Sin patente';
}

/** «Contenedor MSCU1234567 · Ref. PO-881» (lo que el cliente reconoce como suyo). */
export function cargaUnidad(u: UnidadCliente): string | null {
  const partes = [u.contenedor ? `Contenedor ${u.contenedor}` : null, u.referencia ? `Ref. ${u.referencia}` : null].filter(Boolean);
  return partes.length > 0 ? partes.join(' · ') : null;
}

/** «14:32» en la zona horaria del usuario (o «—»). */
export function horaCorta(iso: string | null, zona: string): string {
  if (!iso) return '—';
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '—';
  return new Intl.DateTimeFormat('es-AR', { timeZone: zona, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).format(fecha);
}
