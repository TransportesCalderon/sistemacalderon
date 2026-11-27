/**
 * Migración 386 · El análisis del tope de los pedidos de dinero del chofer (lo arma la base, acá solo se lee):
 * lo que lleva generado de sueldo en mano en el período contra lo que tiene sin rendir, sus pedidos sin cobrar y lo que pide.
 */
export type EstadoTope = 'ok' | 'cerca' | 'pasado' | 'sin_datos';

export interface AnalisisTope {
  estado: EstadoTope;
  /** Para la oficina (en tercera persona). */
  texto: string;
  /** Para el chofer (solo en su propio análisis). */
  textoChofer: string | null;
  generado: number;
  enMano: number;
  fijoGenerado: number;
  bono: number;
  adicionalKm: number;
  descuentoPct: number;
  avisoPct: number;
  sinRendirClp: number;
  pedidosAbiertosClp: number;
  pideClp: number;
  comprometidoClp: number;
  usadoPct: number | null;
  puedePedirHastaClp: number;
  dias: number;
  diasPasados: number;
  monedasSinCambio: string[];
  /** Solo en el análisis guardado de un pedido. */
  pedidoPor: 'chofer' | 'oficina' | null;
}

const ESTADOS: readonly EstadoTope[] = ['ok', 'cerca', 'pasado', 'sin_datos'];

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
};

export function parsearAnalisisTope(v: unknown): AnalisisTope | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const estado = ESTADOS.find((e) => e === o.estado);
  if (!estado) return null;
  const pide = typeof o.pide === 'object' && o.pide !== null ? (o.pide as Record<string, unknown>) : null;
  const usado = o.usado_pct === null || o.usado_pct === undefined ? null : num(o.usado_pct);
  return {
    estado,
    texto: typeof o.texto === 'string' ? o.texto : '',
    textoChofer: typeof o.texto_chofer === 'string' && o.texto_chofer.trim() !== '' ? o.texto_chofer : null,
    generado: num(o.generado),
    enMano: num(o.en_mano),
    fijoGenerado: num(o.fijo_generado),
    bono: num(o.bono),
    adicionalKm: num(o.adicional_km),
    descuentoPct: num(o.descuento_pct),
    avisoPct: num(o.aviso_pct) || 80,
    sinRendirClp: num(o.sin_rendir_clp),
    pedidosAbiertosClp: num(o.pedidos_abiertos_clp),
    pideClp: pide ? num(pide.clp) : 0,
    comprometidoClp: num(o.comprometido_clp),
    usadoPct: usado,
    puedePedirHastaClp: num(o.puede_pedir_hasta_clp),
    dias: num(o.dias),
    diasPasados: num(o.dias_pasados),
    monedasSinCambio: Array.isArray(o.monedas_sin_cambio) ? o.monedas_sin_cambio.filter((m): m is string => typeof m === 'string') : [],
    pedidoPor: o.pedido_por === 'chofer' || o.pedido_por === 'oficina' ? o.pedido_por : null,
  };
}

/** El análisis guardado de cada pedido sin pagar, por id de pedido. */
export function parsearAnalisisDePedidos(v: unknown): Record<number, AnalisisTope> {
  const r: Record<number, AnalisisTope> = {};
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return r;
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    const a = parsearAnalisisTope(x);
    if (a && Number.isInteger(Number(k))) r[Number(k)] = a;
  }
  return r;
}

/** Qué parte de lo generado en mano ya está comprometida (0 a 100, para la barra). */
export function porcentajeBarra(a: AnalisisTope): number {
  if (a.usadoPct !== null) return Math.min(Math.max(a.usadoPct, 0), 100);
  return a.enMano > 0 ? Math.min(Math.round((Math.max(a.comprometidoClp, 0) / a.enMano) * 100), 100) : 0;
}
