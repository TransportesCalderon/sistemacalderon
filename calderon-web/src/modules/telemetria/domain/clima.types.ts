/** Migración 182 · Clima en el mapa de la flota (Open-Meteo, a través de la base). */
export const VERSION_CLIMA_MAPA = 182;

export type CapaClima = '' | 'viento' | 'lluvia' | 'temperatura';
export const CAPAS_CLIMA: { valor: CapaClima; texto: string }[] = [
  { valor: '', texto: 'Sin clima' },
  { valor: 'viento', texto: 'Viento' },
  { valor: 'lluvia', texto: 'Lluvia y nieve' },
  { valor: 'temperatura', texto: 'Temperatura' },
];

export interface PuntoClima {
  lat: number;
  lng: number;
  /** Por hora, desde la hora actual (25 valores). */
  viento: (number | null)[];
  direccion: (number | null)[];
  rafaga: (number | null)[];
  lluvia: (number | null)[];
  nieve: (number | null)[];
  temperatura: (number | null)[];
}

export interface ClimaMapa {
  paso: number;
  horas: string[];
  puntos: PuntoClima[];
  error: string | null;
}

export interface ZonaMapa {
  sur: number;
  oeste: number;
  norte: number;
  este: number;
}

type J = Record<string, unknown>;
const lista = (v: unknown): (number | null)[] => (Array.isArray(v) ? v.map((x) => (x === null || x === undefined ? null : Number(x))) : []);

export function parsearClima(d: unknown): ClimaMapa {
  const x = (d && typeof d === 'object' ? d : {}) as J;
  return {
    paso: Number(x.paso ?? 0),
    horas: Array.isArray(x.horas) ? x.horas.map(String) : [],
    puntos: (Array.isArray(x.puntos) ? (x.puntos as J[]) : []).map((p) => ({
      lat: Number(p.lat),
      lng: Number(p.lng),
      viento: lista(p.v),
      direccion: lista(p.d),
      rafaga: lista(p.r),
      lluvia: lista(p.p),
      nieve: lista(p.n),
      temperatura: lista(p.t),
    })),
    error: typeof x.error === 'string' ? x.error : null,
  };
}

/** La zona se redondea (medio grado) para no pedir de nuevo con cada movimiento chico del mapa. */
export const redondearZona = (z: ZonaMapa): ZonaMapa => ({
  sur: Math.floor(z.sur * 2) / 2,
  oeste: Math.floor(z.oeste * 2) / 2,
  norte: Math.ceil(z.norte * 2) / 2,
  este: Math.ceil(z.este * 2) / 2,
});

/** Viento: verde hasta 20 km/h, amarillo hasta 40, naranja hasta 60, rojo desde 60. */
export function colorViento(kmh: number): string {
  if (kmh < 20) return '#16a34a';
  if (kmh < 40) return '#ca8a04';
  if (kmh < 60) return '#ea580c';
  return '#dc2626';
}

/** Lluvia (mm en la hora) o nieve (cm en la hora). null = no se pinta. */
export function colorPrecipitacion(mm: number | null, nieveCm: number | null): string | null {
  if (nieveCm !== null && nieveCm > 0) return nieveCm >= 1 ? '#7c3aed' : '#c084fc';
  if (mm === null || mm < 0.1) return null;
  if (mm < 1) return '#93c5fd';
  if (mm < 4) return '#3b82f6';
  if (mm < 10) return '#1d4ed8';
  return '#1e3a8a';
}

/** Temperatura: azul/violeta con helada, celeste frío, verde templado, amarillo y rojo calor. */
export function colorTemperatura(c: number): string {
  if (c <= 0) return '#6366f1';
  if (c < 10) return '#60a5fa';
  if (c < 20) return '#34d399';
  if (c < 30) return '#fbbf24';
  return '#ef4444';
}

const RUMBOS = ['norte', 'noreste', 'este', 'sudeste', 'sur', 'sudoeste', 'oeste', 'noroeste'];
/** De dónde viene el viento, en palabras («del oeste»). */
export const deDonde = (grados: number) => `del ${RUMBOS[Math.round((((grados % 360) + 360) % 360) / 45) % 8]}`;

/** El punto de la grilla más cercano (para la ficha de un camión); null si está lejos de la grilla. */
export function climaCercano(c: ClimaMapa | null, lat: number, lng: number): PuntoClima | null {
  if (!c || c.puntos.length === 0) return null;
  let mejor: PuntoClima | null = null;
  let menor = Infinity;
  for (const p of c.puntos) {
    const d = (p.lat - lat) ** 2 + (p.lng - lng) ** 2;
    if (d < menor) {
      menor = d;
      mejor = p;
    }
  }
  return Math.sqrt(menor) <= Math.max(c.paso, 0.25) * 1.5 ? mejor : null;
}

/** Texto del clima de un punto en una hora: «Viento 35 km/h del oeste (ráfagas 60) · 2 mm de lluvia · 5 °C». */
export function textoClima(p: PuntoClima, hora: number): string {
  const v = p.viento[hora], d = p.direccion[hora], r = p.rafaga[hora], ll = p.lluvia[hora], n = p.nieve[hora], t = p.temperatura[hora];
  const partes: string[] = [];
  if (v !== null && v !== undefined) partes.push(`Viento ${Math.round(v)} km/h${d !== null && d !== undefined ? ` ${deDonde(d)}` : ''}${r ? ` (ráfagas ${Math.round(r)})` : ''}`);
  if (n !== null && n !== undefined && n > 0) partes.push(`nieve ${n.toLocaleString('es-AR')} cm`);
  else if (ll !== null && ll !== undefined && ll >= 0.1) partes.push(`lluvia ${ll.toLocaleString('es-AR')} mm`);
  if (t !== null && t !== undefined) partes.push(`${Math.round(t)} °C${t <= 0 ? ' (helada)' : ''}`);
  return partes.join(' · ');
}
