/**
 * Mantenimiento (fase M4) · Modelo 3D simple del tractor (6x4, 3 ejes) y del semi, armado con cajas y
 * cilindros, para marcar en amarillo las zonas de una orden de trabajo. Funciones puras (sin canvas):
 * la pantalla las dibuja en components/mantenimiento/camion-3d.tsx.
 *
 * Es un modelo genérico: cambia la forma de la cabina (alta o baja, corta o larga) según la ficha del
 * camión y muestra la marca como texto; no reproduce el diseño ni el logo de ninguna marca.
 * Ejes: x a lo largo (adelante +), y hacia arriba, z a lo ancho (lado derecho +). Medidas en metros.
 */

export type Vec3 = readonly [number, number, number];

export interface Pieza {
  /** Zonas de mae.zona_equipo a las que pertenece (la primera es la que se elige al tocarla). */
  zonas: readonly string[];
  forma: 'caja' | 'cilindro' | 'perfil';
  centro: Vec3;
  /** Caja: largo (x), alto (y), ancho (z). Cilindro: [radio, largo, radio] a lo largo de «eje». */
  medida: Vec3;
  eje?: 'x' | 'y' | 'z';
  /** Perfil: contorno de costado (x, y), convexo, que se extruye a lo ancho (medida[2]). */
  perfil?: readonly (readonly [number, number])[];
  /** 1 = detalle pegado a otra pieza (ventana, rejilla, faro): se dibuja encima de las caras que miran a la cámara. */
  capa?: number;
  /** Hacia dónde mira un detalle: si mira para el otro lado, no se dibuja (no se ve a través de la cabina). */
  mira?: Vec3;
  color: string;
}

export interface Cara {
  pieza: number;
  puntos: Vec3[];
}

export interface EstiloCabina {
  alta: boolean;
  larga: boolean;
  descripcion: string;
}

const C = {
  cabina: '#eef1f4',
  vidrio: '#3f4b58',
  oscuro: '#2f343a',
  chasis: '#3d434b',
  motor: '#6b7280',
  goma: '#22262b',
  llanta: '#9aa3ad',
  freno: '#7c4a3a',
  tanque: '#b8c0c9',
  luz: '#e9eef3',
  luzTrasera: '#b4413c',
  caja: '#e7ebf0',
  frio: '#8fa1b3',
} as const;

/** Forma de la cabina según la ficha (marca y modelo). Genérica: no copia ningún diseño. */
export function estiloCabina(marca: string | null, modelo: string | null): EstiloCabina {
  const t = `${marca ?? ''} ${modelo ?? ''}`.toLowerCase();
  const baja = /\bp ?\d{3}|\blow\b|\bbaja\b/.test(t);
  const alta = !baja && /high|actros|fh\b|fh ?\d|\bt\b|\br ?\d{3}|\bs ?\d{3}|alta|globetrotter|gigaspace|streamspace/.test(t);
  const larga = /actros|volvo|fh|scania|\br ?\d{3}|\bs ?\d{3}/.test(t);
  const desc = [marca, modelo].filter(Boolean).join(' ').trim();
  return { alta: alta || (!baja && t.trim() === ''), larga, descripcion: desc || 'Tractor' };
}

const caja = (zonas: string[], centro: Vec3, medida: Vec3, color: string): Pieza => ({ zonas, forma: 'caja', centro, medida, color });
const cil = (zonas: string[], centro: Vec3, radio: number, largo: number, eje: 'x' | 'y' | 'z', color: string): Pieza => ({
  zonas,
  forma: 'cilindro',
  centro,
  medida: [radio, largo, radio],
  eje,
  color,
});

/** Marca una pieza como detalle de superficie (se dibuja después). */
const det = (p: Pieza, mira: Vec3 = [1, 0, 0]): Pieza => ({ ...p, capa: 1, mira });

/** Contorno de costado (x, y) extruido a lo ancho, centrado en z. */
const perfil = (zonas: string[], puntos: [number, number][], ancho: number, z: number, color: string): Pieza => {
  const cx = puntos.reduce((s, q) => s + q[0], 0) / puntos.length;
  const cy = puntos.reduce((s, q) => s + q[1], 0) / puntos.length;
  return { zonas, forma: 'perfil', centro: [cx, cy, z], medida: [0, 0, ancho], perfil: puntos, color };
};

/** Ruedas, frenos, eje y suspensión de un eje (doble rueda atrás). */
function eje(codigo: string, x: number, doble: boolean, piso: number): Pieza[] {
  const r = 0.5;
  const y = piso + r;
  const ancho = doble ? 0.6 : 0.34;
  const zr = doble ? 0.95 : 1.05;
  const out: Pieza[] = [caja([codigo], [x, y, 0], [0.18, 0.18, 2 * zr - ancho], C.chasis)];
  for (const s of [-1, 1]) {
    out.push(cil(['ruedas', codigo], [x, y, s * zr], r, ancho, 'z', C.goma));
    out.push(cil(['ruedas', codigo], [x, y, s * (zr + ancho / 2 + 0.005)], 0.3, 0.02, 'z', C.llanta));
    out.push(cil(['ruedas', codigo], [x, y, s * (zr + ancho / 2 + 0.02)], 0.1, 0.03, 'z', C.oscuro));
    out.push(cil(['frenos', codigo], [x, y, s * (zr - ancho / 2 - 0.08)], 0.3, 0.14, 'z', C.freno));
    out.push(caja(['suspension', codigo], [x, y + 0.28, s * 0.45], [1.1, 0.1, 0.1], C.chasis));
  }
  return out;
}

/**
 * Tractor 6x4 (3 ejes), genérico: cabina de frente casi vertical con parabrisas inclinado, visera, espejos,
 * escalones, paragolpes con faros, guardabarros y llantas. Alta o baja y corta o larga según la ficha.
 */
export function modeloTractor(estilo: EstiloCabina): Pieza[] {
  const piso = 1.3;
  const techo = piso + (estilo.alta ? 2.45 : 1.85);
  const atras = estilo.larga ? 1.0 : 1.3;
  const frente = 3.38;
  const ancho = 2.45;
  const zLado = ancho / 2;
  const yVidrio = piso + (estilo.alta ? 1.2 : 1.0);
  const yVidrioArriba = techo - (estilo.alta ? 0.55 : 0.3);
  const p: Pieza[] = [
    // Chasis
    caja(['chasis'], [-0.15, 0.95, 0.45], [6.5, 0.24, 0.12], C.chasis),
    caja(['chasis'], [-0.15, 0.95, -0.45], [6.5, 0.24, 0.12], C.chasis),
    // Cabina: cuerpo con el techo un poco redondeado hacia adelante
    perfil(['cabina'], [[atras, piso], [frente, piso], [frente + 0.02, yVidrio], [frente - 0.14, yVidrioArriba], [frente - 0.32, techo - 0.04],
                        [frente - 0.55, techo], [atras, techo]], ancho, 0, C.cabina),
    // Parabrisas (sigue la inclinación del frente) y ventanas de las puertas
    det(perfil(['cabina'], [[frente + 0.035, yVidrio + 0.05], [frente - 0.12, yVidrioArriba - 0.02], [frente - 0.135, yVidrioArriba - 0.02], [frente + 0.02, yVidrio + 0.05]],
           ancho - 0.25, 0, C.vidrio)),
    det(caja(['cabina'], [frente - 0.75, yVidrio + 0.35, zLado + 0.005], [0.85, 0.75, 0.02], C.vidrio), [0, 0, 1]),
    det(caja(['cabina'], [frente - 0.75, yVidrio + 0.35, -zLado - 0.005], [0.85, 0.75, 0.02], C.vidrio), [0, 0, -1]),
    // Línea de la puerta y franja oscura bajo el parabrisas
    det(caja(['cabina'], [frente - 1.3, piso + 0.9, zLado + 0.006], [0.03, 1.5, 0.01], '#c3c9d0'), [0, 0, 1]),
    det(caja(['cabina'], [frente - 1.3, piso + 0.9, -zLado - 0.006], [0.03, 1.5, 0.01], '#c3c9d0'), [0, 0, -1]),
    det(caja(['cabina'], [frente + 0.025, yVidrio - 0.04, 0], [0.02, 0.08, ancho - 0.2], C.oscuro)),
    // Zócalo oscuro abajo de la cabina, a los costados
    det(caja(['cabina'], [(atras + frente) / 2, piso + 0.12, zLado + 0.008], [frente - atras - 0.05, 0.24, 0.015], '#5f6770'), [0, 0, 1]),
    det(caja(['cabina'], [(atras + frente) / 2, piso + 0.12, -zLado - 0.008], [frente - atras - 0.05, 0.24, 0.015], '#5f6770'), [0, 0, -1]),
    // Visera sobre el parabrisas
    caja(['cabina'], [frente - 0.1, yVidrioArriba + 0.08, 0], [0.32, 0.05, ancho - 0.1], C.oscuro),
    // Espejos con su brazo
    caja(['cabina'], [frente - 0.25, yVidrio + 0.55, zLado + 0.12], [0.05, 0.05, 0.25], C.oscuro),
    caja(['cabina'], [frente - 0.25, yVidrio + 0.55, -zLado - 0.12], [0.05, 0.05, 0.25], C.oscuro),
    caja(['cabina'], [frente - 0.25, yVidrio + 0.4, zLado + 0.27], [0.1, 0.5, 0.2], C.cabina),
    caja(['cabina'], [frente - 0.25, yVidrio + 0.4, -zLado - 0.27], [0.1, 0.5, 0.2], C.cabina),
    // Escalones de la cabina
    caja(['cabina'], [frente - 0.75, 0.62, zLado - 0.06], [0.55, 0.05, 0.22], C.oscuro),
    caja(['cabina'], [frente - 0.75, 1.0, zLado - 0.06], [0.55, 0.05, 0.22], C.oscuro),
    caja(['cabina'], [frente - 0.75, 0.62, -zLado + 0.06], [0.55, 0.05, 0.22], C.oscuro),
    caja(['cabina'], [frente - 0.75, 1.0, -zLado + 0.06], [0.55, 0.05, 0.22], C.oscuro),
    // Frente: rejilla con listones y paragolpes
    det(caja(['motor'], [frente + 0.045, piso + 0.45, 0], [0.02, 0.62, 1.25], C.oscuro)),
    det(caja(['motor'], [frente + 0.065, piso + 0.3, 0], [0.02, 0.04, 1.15], '#7b8590')),
    det(caja(['motor'], [frente + 0.065, piso + 0.48, 0], [0.02, 0.04, 1.15], '#7b8590')),
    det(caja(['motor'], [frente + 0.065, piso + 0.66, 0], [0.02, 0.04, 1.15], '#7b8590')),
    caja(['chasis'], [frente - 0.02, 0.85, 0], [0.32, 0.6, ancho], '#d9dee4'),
    det(caja(['chasis'], [frente + 0.15, 0.6, 0], [0.04, 0.12, ancho - 0.3], C.oscuro)),
    // Guardabarros delanteros y traseros
    caja(['chasis'], [2.55, 1.12, 1.07], [1.15, 0.06, 0.4], C.oscuro),
    caja(['chasis'], [2.55, 1.12, -1.07], [1.15, 0.06, 0.4], C.oscuro),
    caja(['chasis'], [-1.95, 1.12, 0.95], [2.75, 0.05, 0.66], C.oscuro),
    caja(['chasis'], [-1.95, 1.12, -0.95], [2.75, 0.05, 0.66], C.oscuro),
    // Motor y caja de cambios
    caja(['motor'], [2.25, 0.95, 0], [1.4, 0.7, 0.85], C.motor),
    caja(['caja'], [1.05, 0.85, 0], [0.9, 0.45, 0.6], C.motor),
    // Tanques de combustible y de aire
    cil(['tanques'], [0.55, 0.75, 1.05], 0.34, 1.4, 'x', C.tanque),
    cil(['tanques'], [0.55, 0.75, -1.05], 0.34, 1.4, 'x', C.tanque),
    cil(['aire'], [-0.5, 0.62, 0.95], 0.15, 0.75, 'x', C.tanque),
    cil(['aire'], [-0.5, 0.62, -0.95], 0.15, 0.75, 'x', C.tanque),
    // Quinta rueda (plato con la ranura)
    caja(['quinta_rueda'], [-1.9, 1.17, 0], [1.15, 0.1, 1.05], '#4b5563'),
    caja(['quinta_rueda'], [-2.3, 1.225, 0], [0.4, 0.02, 0.14], '#1f2328'),
    // Luces: faros en el paragolpes, traseras y caja de baterías
    det(caja(['electrico'], [frente + 0.145, 0.95, 0.92], [0.02, 0.16, 0.42], C.luz)),
    det(caja(['electrico'], [frente + 0.145, 0.95, -0.92], [0.02, 0.16, 0.42], C.luz)),
    caja(['electrico'], [-3.38, 0.9, 1.0], [0.05, 0.14, 0.3], C.luzTrasera),
    caja(['electrico'], [-3.38, 0.9, -1.0], [0.05, 0.14, 0.3], C.luzTrasera),
    caja(['electrico'], [-0.45, 0.82, -1.08], [0.55, 0.38, 0.3], '#4b5563'),
  ];
  return [...p, ...eje('eje_1', 2.55, false, 0), ...eje('eje_2', -1.3, true, 0), ...eje('eje_3', -2.7, true, 0)];
}

/** Semirremolque de 3 ejes; furgón/refrigerado con caja, plataforma con piso. */
export function modeloSemi(tipo: string | null): Pieza[] {
  const plataforma = tipo === 'plataforma';
  const p: Pieza[] = [
    caja(['chasis'], [0, 1.15, 0.5], [13.4, 0.22, 0.12], C.chasis),
    caja(['chasis'], [0, 1.15, -0.5], [13.4, 0.22, 0.12], C.chasis),
    plataforma ? caja(['carroceria'], [0, 1.36, 0], [13.6, 0.2, 2.5], '#8b6b4a') : caja(['carroceria'], [0, 2.65, 0], [13.6, 2.7, 2.5], C.caja),
    // Perno rey y patas de apoyo
    cil(['perno_rey'], [5.6, 1.0, 0], 0.12, 0.25, 'y', '#b45309'),
    caja(['patas'], [4.1, 0.62, 0.9], [0.14, 1.0, 0.14], C.chasis),
    caja(['patas'], [4.1, 0.62, -0.9], [0.14, 1.0, 0.14], C.chasis),
    caja(['patas'], [4.1, 0.1, 0.9], [0.35, 0.06, 0.3], C.chasis),
    caja(['patas'], [4.1, 0.1, -0.9], [0.35, 0.06, 0.3], C.chasis),
    // Aire y luces
    cil(['aire'], [-1.6, 0.85, 0], 0.18, 1.2, 'x', C.tanque),
    caja(['electrico'], [-6.82, 1.0, 1.0], [0.05, 0.16, 0.35], C.luzTrasera),
    caja(['electrico'], [-6.82, 1.0, -1.0], [0.05, 0.16, 0.35], C.luzTrasera),
    caja(['electrico'], [0, 1.1, 1.26], [0.12, 0.08, 0.02], '#f59e0b'),
    caja(['electrico'], [0, 1.1, -1.26], [0.12, 0.08, 0.02], '#f59e0b'),
  ];
  if (tipo === 'refrigerado') p.push(caja(['equipo_frio'], [6.98, 2.95, 0], [0.45, 1.6, 2.0], C.frio));
  return [...p, ...eje('eje_1', -3.35, true, 0), ...eje('eje_2', -4.7, true, 0), ...eje('eje_3', -6.05, true, 0)];
}

/** ¿La pieza se pinta de amarillo? (alguna de sus zonas está marcada). */
export const piezaMarcada = (p: Pieza, zonas: readonly string[]) => p.zonas.some((z) => zonas.includes(z));

/** Las zonas marcadas que existen en el modelo (para la leyenda). */
export const zonasEnModelo = (piezas: readonly Pieza[], zonas: readonly string[]) => zonas.filter((z) => piezas.some((p) => p.zonas.includes(z)));

/** Caras (polígonos) de cada pieza, en coordenadas del modelo. */
export function caras(piezas: readonly Pieza[], lados = 14): Cara[] {
  const out: Cara[] = [];
  piezas.forEach((p, i) => {
    const [cx, cy, cz] = p.centro;
    if (p.forma === 'caja') {
      const [w, h, d] = p.medida.map((v) => v / 2) as [number, number, number];
      const v = (sx: number, sy: number, sz: number): Vec3 => [cx + sx * w, cy + sy * h, cz + sz * d];
      const q: [number, number, number][][] = [
        [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]],
        [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]],
        [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]],
        [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]],
        [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]],
        [[-1, -1, -1], [-1, 1, -1], [1, 1, -1], [1, -1, -1]],
      ];
      for (const f of q) out.push({ pieza: i, puntos: f.map(([a, b, c]) => v(a, b, c)) });
    } else if (p.forma === 'perfil' && p.perfil) {
      const w = p.medida[2] / 2;
      const pf = p.perfil;
      out.push({ pieza: i, puntos: pf.map(([x, y]) => [x, y, cz + w] as Vec3) });
      out.push({ pieza: i, puntos: [...pf].reverse().map(([x, y]) => [x, y, cz - w] as Vec3) });
      pf.forEach(([x, y], k) => {
        const [x2, y2] = pf[(k + 1) % pf.length]!;
        out.push({ pieza: i, puntos: [[x, y, cz - w], [x2, y2, cz - w], [x2, y2, cz + w], [x, y, cz + w]] });
      });
    } else {
      const [r, largo] = p.medida;
      const e = p.eje ?? 'z';
      const pos = (ang: number, s: number): Vec3 => {
        const a = r * Math.cos(ang);
        const b = r * Math.sin(ang);
        const l = (s * largo) / 2;
        return e === 'z' ? [cx + a, cy + b, cz + l] : e === 'x' ? [cx + l, cy + a, cz + b] : [cx + a, cy + l, cz + b];
      };
      const angs = Array.from({ length: lados }, (_, k) => (2 * Math.PI * k) / lados);
      out.push({ pieza: i, puntos: angs.map((a) => pos(a, 1)) });
      out.push({ pieza: i, puntos: [...angs].reverse().map((a) => pos(a, -1)) });
      angs.forEach((a, k) => {
        const b = angs[(k + 1) % lados]!;
        out.push({ pieza: i, puntos: [pos(a, -1), pos(b, -1), pos(b, 1), pos(a, 1)] });
      });
    }
  });
  return out;
}

/** Gira un punto: primero alrededor de y (giro), después alrededor de x (inclinación). */
export function rotar([x, y, z]: Vec3, giro: number, inclinacion: number): Vec3 {
  const cg = Math.cos(giro), sg = Math.sin(giro);
  const x1 = x * cg + z * sg;
  const z1 = -x * sg + z * cg;
  const ci = Math.cos(inclinacion), si = Math.sin(inclinacion);
  return [x1, y * ci - z1 * si, y * si + z1 * ci];
}

/** Centro y radio del modelo (para encuadrarlo). */
export function encuadre(piezas: readonly Pieza[]): { centro: Vec3; radio: number } {
  const pts = caras(piezas, 6).flatMap((c) => c.puntos);
  const min = [0, 1, 2].map((k) => Math.min(...pts.map((p) => p[k]!)));
  const max = [0, 1, 2].map((k) => Math.max(...pts.map((p) => p[k]!)));
  const centro = [0, 1, 2].map((k) => (min[k]! + max[k]!) / 2) as unknown as Vec3;
  const radio = Math.max(...pts.map((p) => Math.hypot(p[0] - centro[0], p[1] - centro[1], p[2] - centro[2])));
  return { centro, radio };
}

/** Punto dentro de un polígono (2D). */
export function dentro(x: number, y: number, poli: readonly (readonly [number, number])[]): boolean {
  let adentro = false;
  for (let i = 0, j = poli.length - 1; i < poli.length; j = i++) {
    const [xi, yi] = poli[i]!;
    const [xj, yj] = poli[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) adentro = !adentro;
  }
  return adentro;
}
