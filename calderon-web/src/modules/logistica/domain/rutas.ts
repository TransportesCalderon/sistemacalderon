/**
 * Rutas para los choferes (migraciones 135 y 136: una por operación): leer un link de Google Maps, armar el link para seguir
 * la ruta desde donde está el chofer y saber qué paradas ya pasó. Funciones puras (sin red).
 *
 * El truco: un link de Google Maps SIN punto de partida arranca desde la ubicación del teléfono.
 * Así, «retomar» es armar un link nuevo con las paradas que faltan y el destino.
 */

export interface PuntoRuta {
  nombre: string;
  lat: number | null;
  lng: number | null;
}

/** Google Maps acepta hasta 9 paradas intermedias en un link (además del destino). */
export const MAX_PARADAS_LINK = 9;
/** La base acepta hasta 25 puntos por ruta. */
export const MAX_PUNTOS = 25;

type Obj = Record<string, unknown>;
const num = (v: unknown): number | null => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

export const parsearPuntos = (v: unknown): PuntoRuta[] =>
  (Array.isArray(v) ? v : []).map((x, i) => {
    const o = (x ?? {}) as Obj;
    return { nombre: typeof o.nombre === 'string' && o.nombre ? o.nombre : `Punto ${i + 1}`, lat: num(o.lat), lng: num(o.lng) };
  });

/** La ruta de una carga del chofer (ops.fn_mis_cargas → ruta). */
export interface RutaChofer {
  id: number;
  nombre: string;
  notas: string | null;
  linea: string;
  puntos: PuntoRuta[];
}
export const parsearRutaChofer = (v: unknown): RutaChofer | null => {
  if (!v || typeof v !== 'object') return null;
  const o = v as Obj;
  const puntos = parsearPuntos(o.puntos);
  if (puntos.length < 2) return null;
  return {
    id: Number(o.id),
    nombre: typeof o.nombre === 'string' ? o.nombre : '',
    notas: typeof o.notas === 'string' && o.notas ? o.notas : null,
    linea: typeof o.linea === 'string' ? o.linea : '',
    puntos,
  };
};

// -------------------------------------------------------------------------------------------
// Leer un link de Google Maps
// -------------------------------------------------------------------------------------------
const COORD = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

function textoAPunto(t: string): PuntoRuta {
  const m = COORD.exec(t);
  if (m) return { nombre: '', lat: Number(m[1]), lng: Number(m[2]) };
  return { nombre: t.trim(), lat: null, lng: null };
}

const decodificar = (s: string) => {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '));
  } catch {
    return s.replace(/\+/g, ' ');
  }
};

/**
 * Saca los puntos de un link de Google Maps (en orden: partida, paradas, destino).
 * Entiende «/maps/dir/A/B/C/…» (el que se copia del navegador o del celular, ya abierto) y
 * «?api=1&origin=…&destination=…&waypoints=…». Los lugares con nombre toman sus coordenadas
 * de la parte «data=» del link; si no están, quedan sin ubicar (se marcan en el mapa).
 * Un link corto (maps.app.goo.gl) primero hay que abrirlo: lo hace el servidor.
 */
export function leerLinkMaps(link: string): PuntoRuta[] {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return [];
  }
  const q = url.searchParams;
  if (q.get('api') === '1' && (q.get('destination') || q.get('origin'))) {
    const textos = [q.get('origin'), ...(q.get('waypoints') ?? '').split('|'), q.get('destination')].filter((t): t is string => !!t && !!t.trim());
    return textos.map(textoAPunto);
  }
  const partes = url.pathname.split('/');
  const i = partes.indexOf('dir');
  if (i < 0) return [];
  const segmentos: string[] = [];
  for (const s of partes.slice(i + 1)) {
    if (s.startsWith('@') || s.startsWith('data=')) break;
    const t = decodificar(s).trim();
    if (t) segmentos.push(t); // vacío = «Tu ubicación»: se saltea
  }
  const puntos = segmentos.map(textoAPunto);
  // Coordenadas de los lugares con nombre, en el mismo orden («!1d<lng>!2d<lat>» en data=)
  const data = decodificar(url.pathname + url.search);
  const pares = [...data.matchAll(/!1d(-?\d+(?:\.\d+)?)!2d(-?\d+(?:\.\d+)?)/g)].map((m) => ({ lng: Number(m[1]), lat: Number(m[2]) }));
  const sinUbicar = puntos.filter((p) => p.lat === null);
  if (pares.length === sinUbicar.length) sinUbicar.forEach((p, k) => Object.assign(p, pares[k]));
  return puntos;
}

/** El link original es corto (hay que abrirlo en el servidor para ver los puntos). */
export const esLinkCorto = (link: string) => /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl)\//i.test(link.trim());

/** Dominios de Google Maps que se aceptan (también para abrir links cortos en el servidor). */
export const DOMINIOS_MAPS = ['maps.app.goo.gl', 'goo.gl', 'google.com', 'www.google.com', 'maps.google.com', 'google.cl', 'www.google.cl', 'google.com.ar', 'www.google.com.ar'];
export function esLinkDeMaps(link: string): boolean {
  try {
    const u = new URL(link.trim());
    return u.protocol === 'https:' && DOMINIOS_MAPS.includes(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

// -------------------------------------------------------------------------------------------
// Seguir la ruta desde donde está el chofer
// -------------------------------------------------------------------------------------------
const ubicado = (p: PuntoRuta): p is PuntoRuta & { lat: number; lng: number } => p.lat !== null && p.lng !== null;
const coord = (p: PuntoRuta) => `${p.lat},${p.lng}`;

/** Distancia (en metros, aproximada) de un punto al tramo a→b. */
function distanciaATramo(p: { lat: number; lng: number }, a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const k = Math.cos((p.lat * Math.PI) / 180);
  const ax = a.lng * k, ay = a.lat, bx = b.lng * k, by = b.lat, px = p.lng * k, py = p.lat;
  const dx = bx - ax, dy = by - ay;
  const largo = dx * dx + dy * dy;
  const t = largo === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / largo));
  const x = ax + t * dx - px, y = ay + t * dy - py;
  return Math.sqrt(x * x + y * y) * 111_320;
}

/**
 * Índice del próximo punto al que tiene que ir el chofer según dónde está: busca el tramo de la
 * ruta más cercano y devuelve el punto donde termina ese tramo. Sin ubicación, el primero después
 * de la partida.
 */
export function siguientePunto(puntos: PuntoRuta[], pos: { lat: number; lng: number } | null): number {
  if (puntos.length < 2) return puntos.length - 1;
  if (!pos) return 1;
  let mejor = 1;
  let menor = Infinity;
  for (let i = 0; i < puntos.length - 1; i++) {
    const a = puntos[i], b = puntos[i + 1];
    if (!a || !b || !ubicado(a) || !ubicado(b)) continue;
    const d = distanciaATramo(pos, a, b);
    if (d < menor) {
      menor = d;
      mejor = i + 1;
    }
  }
  return mejor;
}

export interface LinkNavegacion {
  url: string;
  /** Hasta dónde llega este link (si la ruta tiene más paradas de las que entran, se sigue por tramos). */
  hasta: PuntoRuta;
  tramoFinal: boolean;
  paradas: number;
}

/**
 * Link de Google Maps desde la ubicación del teléfono, pasando por los puntos que faltan (desde
 * «desde») hasta el destino. Si hay más de 9 paradas, el link llega hasta la 10.ª y al llegar se
 * vuelve a tocar «Retomar».
 */
export function linkDesde(puntos: PuntoRuta[], desde: number): LinkNavegacion | null {
  const faltan = puntos.slice(Math.max(1, Math.min(desde, puntos.length - 1))).filter(ubicado);
  if (faltan.length === 0) return null;
  const tramo = faltan.slice(0, MAX_PARADAS_LINK + 1);
  const destino = tramo[tramo.length - 1]!;
  const paradas = tramo.slice(0, -1);
  const q = new URLSearchParams({ api: '1', destination: coord(destino), travelmode: 'driving' });
  if (paradas.length > 0) q.set('waypoints', paradas.map(coord).join('|'));
  return { url: `https://www.google.com/maps/dir/?${q.toString()}`, hasta: destino, tramoFinal: tramo.length === faltan.length, paradas: paradas.length };
}

/** Link con la ruta completa desde la partida (para que telemetría la pruebe). */
export function linkCompleto(puntos: PuntoRuta[]): string | null {
  const ok = puntos.filter(ubicado);
  if (ok.length < 2) return null;
  const q = new URLSearchParams({ api: '1', origin: coord(ok[0]!), destination: coord(ok[ok.length - 1]!), travelmode: 'driving' });
  const medio = ok.slice(1, -1);
  if (medio.length > 0) q.set('waypoints', medio.slice(0, MAX_PARADAS_LINK).map(coord).join('|'));
  return `https://www.google.com/maps/dir/?${q.toString()}`;
}
