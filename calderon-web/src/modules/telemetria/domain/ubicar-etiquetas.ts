/**
 * Mapa de la flota, vista «desagrupada»: cada camión en su lugar sin que se pisen.
 * Función pura, en píxeles de la pantalla (se recalcula con cada zoom):
 *   1. Los puntos que caen casi en el mismo lugar se abren en ronda alrededor de ese lugar
 *      (con una línea fina hasta la posición real), para que se vean todos.
 *   2. Cada nombre se ubica en el primer lugar libre alrededor de su punto (derecha, izquierda,
 *      arriba, abajo…); si no hay lugar cerca, más lejos y con una línea guía hasta el punto.
 */
export interface CajaEtiqueta {
  id: string;
  /** Posición real del punto (px). */
  x: number;
  y: number;
  /** Tamaño del nombre (px). */
  w: number;
  h: number;
}

export interface EtiquetaUbicada {
  id: string;
  /** Cuánto se corrió el punto desde su posición real (0 si no hizo falta). */
  dx: number;
  dy: number;
  /** Esquina superior izquierda del nombre, relativa al centro del punto. */
  lx: number;
  ly: number;
  /** El nombre quedó lejos: se dibuja una línea guía hasta el punto. */
  guia: boolean;
}

type Rect = { x: number; y: number; w: number; h: number };
const pisa = (a: Rect, b: Rect, margen = 2) =>
  a.x < b.x + b.w + margen && b.x < a.x + a.w + margen && a.y < b.y + b.h + margen && b.y < a.y + a.h + margen;

/** Radio del punto (px) y distancia por debajo de la cual dos puntos se consideran «en el mismo lugar». */
export const RADIO_PUNTO = 9;
export const MISMO_LUGAR = 14;
const SEPARACION_RONDA = 22;

export function ubicarEtiquetas(items: CajaEtiqueta[]): EtiquetaUbicada[] {
  // 1 · Puntos en el mismo lugar: en ronda
  const grupos: { x: number; y: number; ids: number[] }[] = [];
  items.forEach((it, i) => {
    const g = grupos.find((x) => Math.hypot(x.x - it.x, x.y - it.y) < MISMO_LUGAR);
    if (g) g.ids.push(i);
    else grupos.push({ x: it.x, y: it.y, ids: [i] });
  });
  const desplazado = items.map(() => ({ dx: 0, dy: 0 }));
  for (const g of grupos) {
    const n = g.ids.length;
    if (n < 2) continue;
    const cx = g.ids.reduce((a, i) => a + items[i]!.x, 0) / n;
    const cy = g.ids.reduce((a, i) => a + items[i]!.y, 0) / n;
    const r = Math.max(SEPARACION_RONDA, (n * SEPARACION_RONDA) / (2 * Math.PI));
    g.ids.forEach((i, k) => {
      const ang = -Math.PI / 2 + (k * 2 * Math.PI) / n;
      desplazado[i] = { dx: cx + r * Math.cos(ang) - items[i]!.x, dy: cy + r * Math.sin(ang) - items[i]!.y };
    });
  }
  const centro = items.map((it, i) => ({ x: it.x + desplazado[i]!.dx, y: it.y + desplazado[i]!.dy }));
  const puntos: Rect[] = centro.map((c) => ({ x: c.x - RADIO_PUNTO, y: c.y - RADIO_PUNTO, w: RADIO_PUNTO * 2, h: RADIO_PUNTO * 2 }));

  // 2 · Nombres: de arriba hacia abajo, cada uno en el primer lugar libre
  const orden = items.map((_, i) => i).sort((a, b) => centro[a]!.y - centro[b]!.y || centro[a]!.x - centro[b]!.x);
  const ocupados: Rect[] = [];
  const res: EtiquetaUbicada[] = new Array(items.length);
  for (const i of orden) {
    const { w, h, id } = items[i]!;
    const c = centro[i]!;
    const cerca: [number, number][] = [
      [12, -h / 2],
      [-12 - w, -h / 2],
      [8, -h - 8],
      [8, 8],
      [-8 - w, -h - 8],
      [-8 - w, 8],
    ];
    const lejos: [number, number][] = [];
    for (let k = 1; k <= 10; k++) {
      const paso = k * (h + 4);
      lejos.push([16, -h / 2 - paso], [16, -h / 2 + paso], [-16 - w, -h / 2 - paso], [-16 - w, -h / 2 + paso]);
    }
    const libre = (lx: number, ly: number) => {
      const r = { x: c.x + lx, y: c.y + ly, w, h };
      return !ocupados.some((o) => pisa(r, o)) && !puntos.some((p, j) => j !== i && pisa(r, p, 1));
    };
    let elegido: [number, number] = cerca[0]!;
    let guia = false;
    const enCerca = cerca.find(([lx, ly]) => libre(lx, ly));
    if (enCerca) elegido = enCerca;
    else {
      const enLejos = lejos.find(([lx, ly]) => libre(lx, ly));
      if (enLejos) {
        elegido = enLejos;
        guia = true;
      }
    }
    ocupados.push({ x: c.x + elegido[0], y: c.y + elegido[1], w, h });
    res[i] = { id, dx: desplazado[i]!.dx, dy: desplazado[i]!.dy, lx: elegido[0], ly: elegido[1], guia };
  }
  return res;
}
