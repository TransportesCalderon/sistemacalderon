import type { CamionEnVivo, DetalleMapa } from './flota.types';

/**
 * 26/11/2026 · Buscador del Mapa de flota: encuentra un camión (o el celular de un chofer) por patente o código,
 * chofer, N° de operación, cliente o contenedor. Busca en lo que el mapa ya tiene cargado: no le pregunta a la base.
 * Sin acentos ni mayúsculas, y la patente o el contenedor se encuentran con o sin espacios y guiones.
 */

/** Lo que hace falta de un celular para buscarlo (el mapa los muestra con «Ver celulares»). */
export interface CelularBuscable {
  choferId: number;
  chofer: string;
  numeroOperacion: number | null;
  patente: string | null;
  latitud: number;
  longitud: number;
}

/** `texto`: lo que queda escrito en el buscador después de elegirlo (la patente o el chofer). */
export type ResultadoMapa =
  | { tipo: 'camion'; id: number; titulo: string; detalle: string | null; texto: string; conPosicion: boolean }
  | { tipo: 'celular'; id: number; titulo: string; detalle: string | null; texto: string; lat: number; lng: number };

export const MINIMO_LETRAS_MAPA = 2;
export const MAXIMO_RESULTADOS_MAPA = 8;

/** Minúsculas y sin acentos. */
export const normalizar = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
/** Solo letras y números: «SHXB-49», «shxb 49» y «SHXB49» son lo mismo. */
const compacto = (t: string) => normalizar(t).replace(/[^a-z0-9]/g, '');
/** Cuántas letras y números tiene lo escrito (con menos de MINIMO_LETRAS_MAPA no se busca). */
export const letrasDe = (t: string) => compacto(t).length;

/** Una palabra de la búsqueda coincide con un dato si está adentro (tal cual o sin espacios ni signos). */
function coincide(palabra: string, dato: string): boolean {
  const p = normalizar(palabra);
  const c = compacto(palabra);
  return normalizar(dato).includes(p) || (c.length > 0 && compacto(dato).includes(c));
}

/** Todas las palabras tienen que estar en alguno de los datos. */
const estanTodas = (palabras: string[], datos: string[]) => palabras.every((p) => datos.some((d) => coincide(p, d)));

/**
 * Qué tan bien coincide, para ordenar: 3 si lo escrito (o una de sus palabras) es la patente, el código o la operación;
 * 2 si alguno de esos empieza así; 1 si el nombre o el apellido del chofer empieza con la primera palabra; 0 el resto.
 */
function puntaje(palabras: string[], ids: string[], chofer: string | null): number {
  const cs = palabras.map(compacto).filter((c) => c.length > 0);
  const todo = cs.join('');
  const idc = ids.map(compacto);
  if (idc.some((x) => x === todo || cs.includes(x))) return 3;
  if (idc.some((x) => x.startsWith(todo) || cs.some((c) => c.length >= MINIMO_LETRAS_MAPA && x.startsWith(c)))) return 2;
  const primera = normalizar(palabras[0] ?? '');
  if (chofer && normalizar(chofer).split(/[\s,]+/).some((x) => x.length > 0 && x.startsWith(primera))) return 1;
  return 0;
}

const unir = (partes: (string | null | undefined | false)[]) => partes.filter(Boolean).join(' · ') || null;

/**
 * Los camiones y celulares que coinciden con lo escrito, los mejores primero (hasta `maximo`).
 * Con menos de 2 letras o números no busca. `total` dice cuántos coincidieron en total.
 */
export function buscarEnMapa(
  texto: string,
  camiones: CamionEnVivo[],
  detalles: DetalleMapa[],
  celulares: CelularBuscable[] = [],
  maximo = MAXIMO_RESULTADOS_MAPA,
): { resultados: ResultadoMapa[]; total: number } {
  const palabras = texto.trim().split(/\s+/).filter((p) => compacto(p).length > 0);
  if (letrasDe(texto) < MINIMO_LETRAS_MAPA || palabras.length === 0) return { resultados: [], total: 0 };
  const porCamion = new Map(detalles.map((d) => [d.camionId, d]));
  const hallados: { r: ResultadoMapa; puntos: number; orden: string }[] = [];
  const enElMapa = (r: ResultadoMapa) => (r.tipo === 'celular' || r.conPosicion ? 1 : 0);

  for (const c of camiones) {
    const d = porCamion.get(c.camionId);
    const o = d?.operacion ?? null;
    const datos = [c.patente, c.codigoInterno, d?.chofer, o ? `Op. ${o.numero}` : null, o?.cliente, o?.contenedor].filter((x): x is string => !!x);
    if (!estanTodas(palabras, datos)) continue;
    const ids = [c.patente, c.codigoInterno, ...(o ? [String(o.numero)] : [])].filter(Boolean);
    hallados.push({
      r: {
        tipo: 'camion',
        id: c.camionId,
        titulo: unir([c.patente, d?.chofer]) ?? c.patente,
        detalle: unir([o ? `Op. ${o.numero}` : null, o?.cliente, o?.contenedor, c.codigoInterno !== c.patente ? c.codigoInterno : null]),
        texto: c.patente,
        conPosicion: c.latitud !== null && c.longitud !== null,
      },
      puntos: puntaje(palabras, ids, d?.chofer ?? null),
      orden: c.patente,
    });
  }

  for (const x of celulares) {
    const datos = [x.chofer, x.patente, x.numeroOperacion ? `Op. ${x.numeroOperacion}` : null].filter((y): y is string => !!y);
    if (!estanTodas(palabras, datos)) continue;
    const ids = [x.patente, x.numeroOperacion ? String(x.numeroOperacion) : null].filter((y): y is string => !!y);
    hallados.push({
      r: {
        tipo: 'celular',
        id: x.choferId,
        titulo: `${x.chofer} (celular)`,
        detalle: unir([x.numeroOperacion ? `Op. ${x.numeroOperacion}` : null, x.patente]),
        texto: x.chofer,
        lat: x.latitud,
        lng: x.longitud,
      },
      puntos: puntaje(palabras, ids, x.chofer),
      orden: x.chofer,
    });
  }

  // Primero los que están en el mapa (los camiones sin posición del GPS, al final)
  hallados.sort((a, b) => enElMapa(b.r) - enElMapa(a.r) || b.puntos - a.puntos || a.orden.localeCompare(b.orden, 'es'));
  return { resultados: hallados.slice(0, maximo).map((h) => h.r), total: hallados.length };
}
