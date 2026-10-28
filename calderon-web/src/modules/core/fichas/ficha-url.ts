/**
 * Sprint 1 · S1-01 y S1-07: la ficha abierta vive en la dirección, no en la memoria.
 *   ?ficha=carga:1234&rastro=camion:12,chofer:5
 * Así Atrás vuelve a la ficha anterior, un enlace copiado abre lo mismo y cerrar deja la
 * lista exactamente como estaba (los demás parámetros no se tocan). Funciones puras.
 */
export const TIPOS_FICHA = ['camion', 'chofer', 'cliente', 'carga', 'cierre', 'viaje', 'genset', 'empresa', 'operacion', 'factura'] as const;
export type TipoFicha = (typeof TIPOS_FICHA)[number];

export interface RefFicha {
  tipo: TipoFicha;
  id: number;
}

/** Como máximo 4 pasos en el rastro; los más viejos se descartan. */
export const MAX_RASTRO = 4;

export const esTipoFicha = (v: string): v is TipoFicha => (TIPOS_FICHA as readonly string[]).includes(v);

/** 'camion:12' → { tipo: 'camion', id: 12 }; cualquier otra cosa → null. */
export function leerFicha(v: string | null | undefined): RefFicha | null {
  const m = /^([a-z]+):(\d{1,15})$/.exec(v ?? '');
  if (!m || !esTipoFicha(m[1]!)) return null;
  const id = Number(m[2]);
  return Number.isSafeInteger(id) && id > 0 ? { tipo: m[1], id } : null;
}

export const textoFicha = (r: RefFicha) => `${r.tipo}:${r.id}`;
export const mismaFicha = (a: RefFicha | null, b: RefFicha | null) => !!a && !!b && a.tipo === b.tipo && a.id === b.id;

/** 'camion:12,chofer:5' → lista válida (lo inválido se ignora), sin pasar de MAX_RASTRO. */
export function leerRastro(v: string | null | undefined): RefFicha[] {
  const lista = (v ?? '')
    .split(',')
    .map(leerFicha)
    .filter((r): r is RefFicha => r !== null);
  return lista.slice(-MAX_RASTRO);
}

/** Parámetros de la dirección con esta ficha abierta (y su rastro); conserva todos los demás. */
export function conFicha(params: string, ficha: RefFicha, rastro: readonly RefFicha[] = []): string {
  const p = new URLSearchParams(params);
  p.set('ficha', textoFicha(ficha));
  if (rastro.length > 0) p.set('rastro', rastro.map(textoFicha).join(','));
  else p.delete('rastro');
  return `?${p.toString()}`;
}

/** Parámetros sin ficha ni rastro: la lista tal como estaba. Devuelve '' si no queda ninguno. */
export function sinFicha(params: string): string {
  const p = new URLSearchParams(params);
  p.delete('ficha');
  p.delete('rastro');
  const s = p.toString();
  return s ? `?${s}` : '';
}

/**
 * Rastro al abrir otra ficha desde adentro del panel: se agrega la actual. Si la nueva ya
 * estaba en el rastro, se vuelve a ese punto (no se repite). Nunca pasa de MAX_RASTRO.
 */
export function rastroAlAbrir(actual: RefFicha, rastro: readonly RefFicha[], nueva: RefFicha): RefFicha[] {
  if (mismaFicha(actual, nueva)) return [...rastro];
  const previo = rastro.findIndex((r) => mismaFicha(r, nueva));
  if (previo >= 0) return rastro.slice(0, previo);
  return [...rastro, actual].slice(-MAX_RASTRO);
}

/** Volver al paso n del rastro: esa ficha queda abierta y se corta lo que seguía. */
export function volverA(rastro: readonly RefFicha[], n: number): { ficha: RefFicha; rastro: RefFicha[] } | null {
  const ficha = rastro[n];
  return ficha ? { ficha, rastro: rastro.slice(0, n) } : null;
}
