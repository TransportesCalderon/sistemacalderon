/**
 * Chat por voz con Iris (30/10/2026), con lo que trae el celular o la compu: sin claves ni costo.
 *   · Escuchar: reconocimiento de voz del navegador (Chrome, Edge, Safari de iPhone y Mac).
 *   · Hablar: la voz femenina en castellano que tenga el dispositivo (la exacta depende de cada uno).
 * Si después se suma una voz premium, se cambia solo `hablar` (el resto queda igual).
 * Acá solo lo puro (elegir la voz y armar el texto a leer); los hooks están en voz-hooks.ts.
 */
import { parsearMarkdown, type Trozo } from './markdown';

/** Voces femeninas conocidas en castellano (iPhone/Mac, Android/Chrome y Windows/Edge). */
const FEMENINAS = [
  'paulina', 'mónica', 'monica', 'marisol', 'angélica', 'angelica', 'francisca', 'isabela', 'soledad', 'luciana', 'valeria',
  'sabina', 'helena', 'laura', 'elena', 'dalia', 'elvira', 'paloma', 'salome', 'salomé', 'camila', 'lucía', 'lucia', 'elsa',
  'female', 'mujer', 'google español',
];
const MASCULINAS = ['jorge', 'juan', 'diego', 'carlos', 'enrique', 'pablo', 'raul', 'raúl', 'tomas', 'tomás', 'alvaro', 'álvaro', 'jorge', 'eddy', 'reed', 'rocko', 'grandpa', 'male', 'hombre'];
/** Primero las variantes latinoamericanas (más cerca del rioplatense), después España. */
const IDIOMAS = ['es-ar', 'es-419', 'es-us', 'es-mx', 'es-cl', 'es-co', 'es-es'];

export interface VozDisponible {
  name: string;
  lang: string;
  localService?: boolean;
}

/** La mejor voz femenina en castellano del dispositivo (o la primera en castellano; null si no hay). */
export function elegirVoz<V extends VozDisponible>(voces: readonly V[]): V | null {
  let mejor: V | null = null;
  let puntos = -Infinity;
  for (const v of voces) {
    const lang = v.lang.toLowerCase().replace('_', '-');
    if (!lang.startsWith('es')) continue;
    const nombre = v.name.toLowerCase();
    let p = 0;
    if (FEMENINAS.some((f) => nombre.includes(f))) p += 100;
    if (MASCULINAS.some((m) => nombre.includes(m))) p -= 100;
    const i = IDIOMAS.indexOf(lang);
    p += i >= 0 ? 20 - i * 2 : 0;
    if (/premium|enhanced|mejorad|natural|neural|online/.test(nombre)) p += 15;
    if (p > puntos) {
      mejor = v;
      puntos = p;
    }
  }
  return mejor;
}

const plano = (ts: Trozo[]) => ts.map((t) => t.texto).join('');

/** El texto de la respuesta para leer en voz alta: sin Markdown y con las tablas fila por fila. */
export function textoParaLeer(markdown: string): string {
  const partes: string[] = [];
  for (const b of parsearMarkdown(markdown)) {
    if (b.tipo === 'titulo' || b.tipo === 'parrafo') partes.push(b.tipo === 'titulo' ? plano(b.trozos) : b.lineas.map(plano).join(' '));
    else if (b.tipo === 'lista') partes.push(b.items.map(plano).join('. '));
    else if (b.tipo === 'tabla') {
      for (const fila of b.filas) partes.push(fila.map((c, i) => (i === 0 ? plano(c) : `${plano(b.encabezado[i] ?? [])}: ${plano(c)}`)).join(', '));
    }
  }
  return partes
    .map((p) => p.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .map((p) => (/[.!?:]$/.test(p) ? p : `${p}.`))
    .join(' ')
    .replace(/\b(USD|US\$|CLP|ARS)\s*(-?\d[\d.,]*\d|-?\d)/g, '$2 $1')
    .replace(/\bUSD\b|US\$/g, 'dólares')
    .replace(/\bCLP\b/g, 'pesos chilenos')
    .replace(/\bARS\b/g, 'pesos')
    .replace(/\bkm\b/g, 'kilómetros');
}

/** Corta el texto en frases de hasta `max` letras (algunos navegadores cortan las lecturas largas). */
export function trozosParaLeer(texto: string, max = 220): string[] {
  const frases = texto.split(/(?<=[.!?])\s+/); // «1.500» no corta: solo punto y espacio
  const out: string[] = [];
  let actual = '';
  for (const f of frases.map((x) => x.trim()).filter(Boolean)) {
    if (actual && actual.length + f.length + 1 > max) {
      out.push(actual);
      actual = '';
    }
    if (f.length > max) {
      for (const parte of f.match(new RegExp(`.{1,${max}}(\\s|$)`, 'g')) ?? [f]) out.push(parte.trim());
    } else actual = actual ? `${actual} ${f}` : f;
  }
  if (actual) out.push(actual);
  return out;
}

/**
 * Modo reunión: Iris escucha siempre pero responde solo si la nombran. Devuelve lo que le piden,
 * '' si solo la nombraron (la pregunta viene en la frase siguiente) o null si no era para ella.
 * El dictado a veces escribe «Siri» o «Airis»: también valen.
 */
export function pedidoParaIris(frase: string): string | null {
  const m = /(?:^|[\s,.;:¡¿!?])(?:iris|íris|airis|siri)(?=$|[\s,.;:!?])/i.exec(frase);
  if (!m) return null;
  const despues = frase
    .slice(m.index + m[0].length)
    .replace(/^[\s,.;:!?]+/, '')
    .trim();
  if (despues.length >= 3) return despues;
  // «¿Cuánto facturamos este mes, Iris?»: la pregunta vino antes del nombre
  const antes = frase
    .slice(0, m.index)
    .replace(/(^|\s)(oye|che|hola|a ver|escucha|escuchá|ok|okey|bueno)(?=\s|,|$)/gi, ' ')
    .replace(/[\s,.;:¡!]+/g, ' ')
    .trim();
  return antes.length >= 12 ? antes : '';
}

/** «Iris, silencio», «Iris, gracias»: no es una pregunta, es que se calle. */
export function esOrdenDeCallar(pedido: string): boolean {
  return /^(silencio|par[aá]|parate|callate|cállate|basta|suficiente|gracias|listo|esper[aá]|un momento|un segundo|perd[oó]n)(?=$|[\s,.;:!?])/i.test(pedido.trim());
}

/** Cuánto silencio se espera antes de dar por terminada la pregunta (modo reunión). */
export const PAUSA_REUNION_MS = { terminada: 3500, pensando: 8000 } as const;

/**
 * ¿La frase quedó por la mitad? Si termina en una palabra que pide seguir («de», «que», «para», «y», «o sea», «eh»…),
 * en coma, o es muy corta, quien habla todavía está armando la pregunta: se espera más silencio antes de responder.
 */
export function pareceIncompleta(texto: string): boolean {
  const t = texto.trim().toLowerCase();
  if (!t) return true;
  if (/[,;:…]$/.test(t) || /\.\.\.$/.test(t)) return true;
  const limpio = t.replace(/[¿?¡!.]+$/g, '').trim();
  if (limpio.split(/\s+/).length < 3) return true;
  return /(^|\s)(y|e|o|u|ni|pero|que|de|del|a|al|en|con|sin|por|para|como|cuando|donde|si|porque|entre|desde|hasta|sobre|según|el|la|los|las|un|una|unos|unas|lo|su|sus|mi|mis|este|esta|ese|esa|o sea|es decir|eh|em|este|bueno|digamos|más|menos|cuánto|cuántos|cuántas|cuál|qué|tipo)$/.test(limpio);
}

/** «…y eso es todo», «…listo»: quien habla avisa que terminó; se responde sin esperar el silencio. */
export function quitarCierre(texto: string): { texto: string; cerro: boolean } {
  const m = /[\s,.;]*(?:y\s+)?(?:eso es todo|eso ser[ií]a todo|nada m[aá]s|listo|respond[eé](?:me)?|adelante)[\s.!]*$/i.exec(texto);
  if (!m || m.index === 0) return { texto: texto.trim(), cerro: false };
  return { texto: texto.slice(0, m.index).trim(), cerro: true };
}
