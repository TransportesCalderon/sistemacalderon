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
  /** Migración 158: «ruta k de n». */
  orden: number;
  total: number;
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
    orden: Number(o.orden ?? 1),
    total: Number(o.total ?? 1),
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
  // Todos los segmentos, también los vacíos («Tu ubicación»), para alinearlos con data=
  const todos: string[] = [];
  for (const s of partes.slice(i + 1)) {
    if (s.startsWith('@') || s.startsWith('data=')) break;
    todos.push(decodificar(s).trim());
  }
  while (todos.length > 0 && todos[todos.length - 1] === '') todos.pop();
  const conVacios = todos.map((t) => (t ? textoAPunto(t) : null));
  const puntos = conVacios.filter((p): p is PuntoRuta => p !== null); // vacío = «Tu ubicación»: se saltea
  const data = decodificar(url.pathname + url.search);

  // 1) Leyendo la estructura de data=: cada punto de la ruta es un «!1m…» del bloque de direcciones,
  //    en el mismo orden que el link; sus coordenadas son su «!2m2!1d<lng>!2d<lat>» propio.
  //    Así un punto sin coordenadas (p. ej. una dirección escrita, «!1m0») no corre a los demás.
  const k = data.indexOf('data=');
  if (k >= 0) {
    const paradas = paradasData(data.slice(k + 5), [conVacios.length, puntos.length]);
    if (paradas) {
      const destino = paradas.length === conVacios.length ? conVacios : puntos;
      destino.forEach((p, j) => {
        const c = paradas[j];
        if (p && p.lat === null && c) Object.assign(p, c);
      });
      return puntos;
    }
  }
  // 2) Respaldo: las «!2m2» en orden, si son tantas como los puntos sin ubicar.
  //    Solo las de «!2m2»: los desvíos que se arrastran en el mapa («!3m4!1m2!1d…!2d…») no son puntos.
  const pares = [...data.matchAll(/!2m2!1d(-?\d+(?:\.\d+)?)!2d(-?\d+(?:\.\d+)?)/g)].map((m) => ({ lng: Number(m[1]), lat: Number(m[2]) }));
  const sinUbicar = puntos.filter((p) => p.lat === null);
  if (pares.length === sinUbicar.length) sinUbicar.forEach((p, j) => Object.assign(p, pares[j]));
  return puntos;
}

interface NodoData {
  campo: string;
  tipo: string;
  valor: string;
  hijos: NodoData[];
}

/** Arma el árbol de «data=» de Google Maps («!<campo><tipo><valor>»; «m» = mensaje con N elementos adentro). */
function arbolData(data: string): NodoData[] {
  const toks = data
    .split('!')
    .map((t) => /^(\d+)([a-z])(.*)$/.exec(t))
    .filter((m): m is RegExpExecArray => m !== null);
  let i = 0;
  const leer = (n: number): NodoData[] => {
    const out: NodoData[] = [];
    let quedan = n;
    while (quedan > 0 && i < toks.length) {
      const m = toks[i++]!;
      const nodo: NodoData = { campo: m[1]!, tipo: m[2]!, valor: m[3]!, hijos: [] };
      quedan--;
      if (nodo.tipo === 'm') {
        const antes = i;
        nodo.hijos = leer(Number(nodo.valor) || 0);
        quedan -= i - antes;
      }
      out.push(nodo);
    }
    return out;
  };
  return leer(Number.POSITIVE_INFINITY);
}

/**
 * Las coordenadas de cada punto según data= (null si ese punto no las trae), o null si no se
 * encontró un bloque con tantos puntos como el link.
 */
function paradasData(data: string, cantidades: number[]): ({ lat: number; lng: number } | null)[] | null {
  const pila = arbolData(data);
  while (pila.length > 0) {
    const n = pila.shift()!;
    const wp = n.hijos.filter((h) => h.campo === '1' && h.tipo === 'm');
    if (n.tipo === 'm' && wp.length >= 2 && cantidades.includes(wp.length)) {
      return wp.map((w) => {
        const c = w.hijos.find((h) => h.campo === '2' && h.tipo === 'm');
        const lng = Number(c?.hijos.find((h) => h.campo === '1' && h.tipo === 'd')?.valor);
        const lat = Number(c?.hijos.find((h) => h.campo === '2' && h.tipo === 'd')?.valor);
        return c && Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0) ? { lat, lng } : null;
      });
    }
    pila.push(...n.hijos);
  }
  return null;
}

/** Para ubicar por la dirección (servidor): variantes de la dirección, de la más exacta a la más general. */
export function variantesDireccion(texto: string): string[] {
  const t = texto.replace(/\s+/g, ' ').trim();
  const sinCodigo = t.replace(/\b\d{7}\b\s*/g, '').replace(/\s+,/g, ',').trim(); // código postal chileno
  const sinNegocio = sinCodigo.replace(/^[^,]*?\s-\s/, '').trim(); // «Shell - Av. Lo Espejo…» → «Av. Lo Espejo…»
  const sinRegion = sinNegocio.replace(/,\s*Regi[oó]n[^,]*/i, '').trim();
  const corta = sinRegion.replace(/\bCmo\.?\s/i, 'Camino ').replace(/\bAv\.?\s/i, 'Avenida ');
  return [...new Set([t, sinCodigo, sinNegocio, sinRegion, corta].filter((x) => x.length >= 6))];
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

/** Distancia (en metros, aproximada) de un punto al tramo a→b, y dónde cae sobre el tramo (0 = en a, 1 = en b; menor que 0 = antes de a). */
function medirTramo(p: { lat: number; lng: number }, a: { lat: number; lng: number }, b: { lat: number; lng: number }): { d: number; t: number } {
  const k = Math.cos((p.lat * Math.PI) / 180);
  const ax = a.lng * k, ay = a.lat, bx = b.lng * k, by = b.lat, px = p.lng * k, py = p.lat;
  const dx = bx - ax, dy = by - ay;
  const largo = dx * dx + dy * dy;
  const tLibre = largo === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / largo;
  const t = Math.max(0, Math.min(1, tLibre));
  const x = ax + t * dx - px, y = ay + t * dy - py;
  return { d: Math.sqrt(x * x + y * y) * 111_320, t: tLibre };
}

/** A menos de esto de un punto se lo da por alcanzado (no se lo vuelve a mandar como parada). */
const ALCANZADO_M = 1_500;
/** A más de esto de cualquier tramo, el chofer está fuera de la ruta (p. ej. todavía en la base). */
const FUERA_M = 5_000;

/**
 * Índice del próximo punto al que tiene que ir el chofer según dónde está: busca el tramo de la ruta
 * más cercano y devuelve el punto donde termina ese tramo. Si todavía no llegó a la partida (está
 * antes del primer tramo y lejos de la partida), devuelve 0: la ruta arranca en la partida.
 * Sin ubicación, desde la partida.
 */
export function siguientePunto(puntos: PuntoRuta[], pos: { lat: number; lng: number } | null): number {
  if (puntos.length < 2) return Math.max(0, puntos.length - 1);
  if (!pos) return 0;
  let mejor = 1;
  let menor = Infinity;
  let tMejor = 0;
  for (let i = 0; i < puntos.length - 1; i++) {
    const a = puntos[i], b = puntos[i + 1];
    if (!a || !b || !ubicado(a) || !ubicado(b)) continue;
    const m = medirTramo(pos, a, b);
    if (m.d < menor) {
      menor = m.d;
      mejor = i + 1;
      tMejor = m.t;
    }
  }
  const p0 = puntos[0];
  if (mejor === 1 && tMejor <= 0 && p0 && ubicado(p0) && medirTramo(pos, p0, p0).d > ALCANZADO_M) return 0;
  // Lejos de la ruta (todavía no la empezó, p. ej. está en la base, o se desvió mucho): que vaya al
  // comienzo del tramo más cercano. Antes iba al final de ese tramo y se salteaba la primera parada.
  if (menor > FUERA_M) return mejor - 1;
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
 * Link de Google Maps desde la ubicación del teléfono («Tu ubicación»), pasando por TODOS los puntos
 * que faltan (desde «desde») hasta el último. Formato /maps/dir//a/b/c: la app de Google Maps del
 * celular respeta todas las paradas (el formato api=1 en el celular se queda con la primera). Entran
 * hasta 10 puntos; si la ruta tiene más, el link llega hasta el 10.º y al volver a tocar «Continuar
 * viaje» sigue desde donde esté.
 */
export function linkDesde(puntos: PuntoRuta[], desde: number): LinkNavegacion | null {
  const faltan = puntos.slice(Math.max(0, Math.min(desde, puntos.length - 1))).filter(ubicado);
  if (faltan.length === 0) return null;
  const tramo = faltan.slice(0, MAX_PARADAS_LINK + 1);
  const destino = tramo[tramo.length - 1]!;
  return {
    url: `https://www.google.com/maps/dir//${tramo.map(coord).join('/')}`,
    hasta: destino,
    tramoFinal: tramo.length === faltan.length,
    paradas: tramo.length - 1,
  };
}

/** Link con la ruta completa desde la partida (para que telemetría la pruebe). */
export function linkCompleto(puntos: PuntoRuta[]): string | null {
  const ok = puntos.filter(ubicado);
  if (ok.length < 2) return null;
  return `https://www.google.com/maps/dir/${ok.slice(0, MAX_PARADAS_LINK + 2).map(coord).join('/')}`;
}

/** Migración 156: pantalla «Rutas para choferes» (operaciones abiertas, con ruta o sin ruta). */
export const VERSION_RUTAS_PANTALLA = 156;
export interface OperacionRuta {
  servicioId: number;
  numero: number;
  cliente: string;
  origen: string;
  destino: string;
  estado: string;
  presentacion: string | null;
  tractor: string | null;
  chofer: string | null;
  /** Migración 158: total de rutas, cuántas hechas y cuál está en curso (null: terminó todas). */
  ruta: { puntos: number; partida: string; destino: string; notas: string | null; total: number; hechas: number; orden: number | null } | null;
  desvio: { km: number; minutos: number; alerta: boolean } | null;
}
const txt = (v: unknown) => (typeof v === 'string' ? v : '');
const txtN = (v: unknown) => (typeof v === 'string' && v ? v : null);
export const parsearOperacionesRuta = (v: unknown): OperacionRuta[] =>
  (Array.isArray(v) ? v : []).map((x) => {
    const o = (x ?? {}) as Obj;
    const r = o.ruta && typeof o.ruta === 'object' ? (o.ruta as Obj) : null;
    const d = o.desvio && typeof o.desvio === 'object' ? (o.desvio as Obj) : null;
    return {
      servicioId: Number(o.servicio_id),
      numero: Number(o.numero_operacion),
      cliente: txt(o.cliente),
      origen: txt(o.origen),
      destino: txt(o.destino),
      estado: txt(o.estado),
      presentacion: txtN(o.fecha_presentacion),
      tractor: txtN(o.tractor),
      chofer: txtN(o.chofer),
      ruta: r
        ? {
            puntos: Number(r.puntos ?? 0),
            partida: txt(r.partida),
            destino: txt(r.destino),
            notas: txtN(r.notas),
            total: Number(r.total ?? 1),
            hechas: Number(r.hechas ?? 0),
            orden: r.orden === undefined ? 1 : r.orden === null ? null : Number(r.orden),
          }
        : null,
      desvio: d ? { km: Number(d.km), minutos: Number(d.minutos), alerta: d.alerta === true } : null,
    };
  });

/** Migración 156: un desvío de la ruta para la ventana emergente. */
export interface AvisoDesvio {
  id: number;
  servicioId: number;
  numero: number;
  cliente: string;
  tractor: string;
  chofer: string | null;
  desde: string;
  minutos: number;
  km: number;
  kmMax: number;
  lat: number | null;
  lng: number | null;
}
/** Migración 177: tanque bajo (sensor en 20 % o menos) para la ventana emergente. */
export interface AvisoTanqueBajo {
  id: number;
  tractor: string;
  chofer: string | null;
  desde: string;
  pct: number;
  litros: number | null;
  ultimoPct: number;
  lat: number | null;
  lng: number | null;
}
export const parsearAvisosTanqueBajo = (v: unknown): AvisoTanqueBajo[] =>
  (Array.isArray(v) ? v : []).map((x) => {
    const o = (x ?? {}) as Obj;
    return {
      id: Number(o.id),
      tractor: txt(o.tractor),
      chofer: txtN(o.chofer),
      desde: txt(o.desde),
      pct: Number(o.pct ?? 0),
      litros: num(o.litros),
      ultimoPct: Number(o.ultimo_pct ?? o.pct ?? 0),
      lat: num(o.latitud),
      lng: num(o.longitud),
    };
  });
export const parsearAvisosDesvio = (v: unknown): AvisoDesvio[] =>
  (Array.isArray(v) ? v : []).map((x) => {
    const o = (x ?? {}) as Obj;
    return {
      id: Number(o.id),
      servicioId: Number(o.servicio_id),
      numero: Number(o.numero_operacion),
      cliente: txt(o.cliente),
      tractor: txt(o.tractor),
      chofer: txtN(o.chofer),
      desde: txt(o.desde),
      minutos: Number(o.minutos ?? 0),
      km: Number(o.km ?? 0),
      kmMax: Number(o.km_max ?? 0),
      lat: num(o.latitud),
      lng: num(o.longitud),
    };
  });

/** Migración 161: «Rutas para choferes» por chofer (tabla de choferes activos). */
export const VERSION_RUTAS_CHOFER = 161;
export interface OperacionChofer {
  servicioId: number;
  numero: number;
  estado: string;
  cliente: string;
  origen: string;
  destino: string;
}
export interface ChoferRutas {
  choferId: number;
  chofer: string;
  camionId: number | null;
  tractor: string | null;
  operaciones: OperacionChofer[];
  /** Rutas que le faltan (incluida la en curso). */
  pendientes: number;
  ruta: { id: number; servicioId: number | null; numero: number | null; partida: string; destino: string } | null;
  desvio: { km: number; minutos: number; alerta: boolean } | null;
}
const numN = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
export const parsearChoferesRutas = (v: unknown): ChoferRutas[] =>
  (Array.isArray(v) ? v : []).map((x) => {
    const o = (x ?? {}) as Obj;
    const r = o.ruta && typeof o.ruta === 'object' ? (o.ruta as Obj) : null;
    const d = o.desvio && typeof o.desvio === 'object' ? (o.desvio as Obj) : null;
    return {
      choferId: Number(o.chofer_id),
      chofer: txt(o.chofer),
      camionId: numN(o.camion_id),
      tractor: txtN(o.tractor),
      operaciones: (Array.isArray(o.operaciones) ? o.operaciones : []).map((y) => {
        const p = (y ?? {}) as Obj;
        return { servicioId: Number(p.servicio_id), numero: Number(p.numero), estado: txt(p.estado), cliente: txt(p.cliente), origen: txt(p.origen), destino: txt(p.destino) };
      }),
      pendientes: Number(o.pendientes ?? 0),
      ruta: r ? { id: Number(r.id), servicioId: numN(r.servicio_id), numero: numN(r.numero), partida: txt(r.partida), destino: txt(r.destino) } : null,
      desvio: d ? { km: Number(d.km), minutos: Number(d.minutos), alerta: d.alerta === true } : null,
    };
  });

/** Migración 161: la ruta en curso del chofer (con operación o movimiento). */
export interface MiRuta {
  id: number;
  servicioId: number | null;
  numero: number | null;
  nombre: string;
  notas: string | null;
  puntos: PuntoRuta[];
}
export const parsearMiRuta = (v: unknown): MiRuta | null => {
  if (!v || typeof v !== 'object') return null;
  const o = v as Obj;
  const puntos = parsearPuntos(o.puntos);
  if (puntos.length < 2) return null;
  return { id: Number(o.id), servicioId: numN(o.servicio_id), numero: numN(o.numero), nombre: txt(o.nombre), notas: txtN(o.notas), puntos };
};
