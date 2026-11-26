import { z } from 'zod';
import { numeroOpc } from '@/modules/ventas/domain/ventas.schemas';
import { formatearFechaDia } from '@/shared/lib/fechas';
import { dinero } from './finanzas.types';

/**
 * Migración 367 · Planificador de caja (fin.fn_plan_caja): la caja de hoy y, semana por semana, lo que entra, lo que
 * sale y el saldo. La base arma todo con lo que está cargado en el sistema y lo que se agrega a mano; acá solo se
 * convierten tipos y se ordena para mostrar.
 */
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? (v as Obj[]) : []);
const num = (v: unknown): number => (v === null || v === undefined || v === '' ? 0 : Number(v));
const numN = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));
const txt = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v));

export type MonedaPlan = 'CLP' | 'USD';
export const CERTEZAS = ['segura', 'probable', 'dudosa'] as const;
export type Certeza = (typeof CERTEZAS)[number];
export const ETIQUETA_CERTEZA: Record<Certeza, string> = { segura: 'Segura', probable: 'Probable', dudosa: 'Dudosa' };
const certeza = (v: unknown): Certeza => (CERTEZAS.find((c) => c === v) ?? 'probable');

/** De dónde sale cada partida del plan. Las que salen del sistema se ajustan (fecha, contar o no); las «partida» se cargan a mano. */
export const ORIGENES_AJUSTABLES = ['factura', 'prefactura', 'servicio', 'gasto', 'fijo', 'liquidacion', 'pago_carga', 'pedido_fondo', 'cargas_proveedor'] as const;
export type OrigenAjustable = (typeof ORIGENES_AJUSTABLES)[number];
export type OrigenPlan = OrigenAjustable | 'partida';
export type Sentido = 'entrada' | 'salida';
/** Dónde cae: en una semana del plan, sin fecha (vencido sin fecha cargada), después del plan, sin contar o sin tipo de cambio. */
export type Cubo = 'semana' | 'sin_fecha' | 'despues' | 'no_contar' | 'sin_cambio';

export interface CuentaCaja {
  id: number;
  nombre: string;
  tipo: 'banco' | 'caja';
  moneda: string;
  saldo: number;
  /** En la moneda en que se mira el plan; null si falta el tipo de cambio. */
  saldoVista: number | null;
  cartolaFecha: string | null;
  cartolaSaldo: number | null;
  porConciliar: number;
}

export interface SemanaPlan {
  n: number;
  desde: string;
  hasta: string;
  entradas: number;
  salidas: number;
  neto: number;
  /** Saldo al final de la semana con lo esperado. */
  saldo: number;
  /** Saldo si solo entra lo seguro y sale todo. */
  saldoPrudente: number;
}

export interface PartidaPlan {
  clave: string;
  origen: OrigenPlan;
  id: number;
  sentido: Sentido;
  grupo: string;
  titulo: string;
  detalle: string | null;
  fecha: string | null;
  fechaBase: string | null;
  /** Cómo se eligió la fecha (lo explica la base). */
  supuesto: string | null;
  moneda: string;
  monto: number;
  montoVista: number | null;
  certeza: Certeza;
  cubo: Cubo;
  semana: number | null;
  /** Si entra en el saldo esperado (las dudosas no entran salvo que se pida). */
  cuenta: boolean;
  nota: string | null;
  /** Alguien le cambió algo a mano (fecha, certeza, nota o si se cuenta). */
  ajustada: boolean;
  /** La fecha y la certeza que cargó una persona (null = las que propone el sistema). */
  fechaCargada: string | null;
  certezaCargada: Certeza | null;
  ajustable: boolean;
  /** Gasto fijo que todavía no se generó: solo se puede dejar de contar. */
  soloContar: boolean;
  atrasada: boolean;
  // Solo las cargadas a mano
  categoria: string | null;
  tercero: string | null;
  descripcion: string | null;
  version: number | null;
}

export interface PuntoPlan {
  n: number;
  desde: string;
  hasta: string;
  saldo: number;
}
export interface FaltaPlan {
  n: number;
  desde: string;
  hasta: string;
  falta: number;
}
export interface ResumenPlan {
  entradas: number;
  salidas: number;
  saldoFinal: number;
  saldoMinimo: PuntoPlan | null;
  primeraNegativa: FaltaPlan | null;
  prudenteMinimo: PuntoPlan | null;
  prudentePrimeraNegativa: FaltaPlan | null;
  sinFechaCobrar: { monto: number; cantidad: number };
  sinFechaPagar: { monto: number; cantidad: number };
  despuesEntradas: number;
  despuesSalidas: number;
  dudosasSinContar: { entradas: number; salidas: number; cantidad: number };
  noContar: { entradas: number; salidas: number; cantidad: number };
}

export interface CategoriaPlan {
  codigo: string;
  tipo: Sentido;
  nombre: string;
}
export interface PartidaCerrada {
  id: number;
  tipo: Sentido;
  descripcion: string;
  tercero: string | null;
  fecha: string;
  moneda: string;
  monto: number;
  estado: 'cumplida' | 'anulada';
  cerradaEn: string | null;
}

export interface PlanCaja {
  hoy: string;
  moneda: MonedaPlan;
  semanas: number;
  hasta: string;
  conDudosas: boolean;
  conViajes: boolean;
  puedeEditar: boolean;
  caja: { total: number; cuentas: CuentaCaja[] };
  plan: SemanaPlan[];
  resumen: ResumenPlan;
  partidas: PartidaPlan[];
  avisos: string[];
  cuentaVentaActivos: { codigo: string; nombre: string } | null;
  categorias: CategoriaPlan[];
  cerradas: PartidaCerrada[];
}

const punto = (v: unknown): PuntoPlan | null => {
  if (!v || typeof v !== 'object') return null;
  const o = obj(v);
  return { n: num(o.n), desde: String(o.desde ?? ''), hasta: String(o.hasta ?? ''), saldo: num(o.saldo) };
};
const falta = (v: unknown): FaltaPlan | null => {
  if (!v || typeof v !== 'object') return null;
  const o = obj(v);
  return { n: num(o.n), desde: String(o.desde ?? ''), hasta: String(o.hasta ?? ''), falta: num(o.falta) };
};
const CUBOS: readonly Cubo[] = ['semana', 'sin_fecha', 'despues', 'no_contar', 'sin_cambio'];

export function parsearPlanCaja(raw: unknown): PlanCaja {
  const j = obj(raw);
  const r = obj(j.resumen);
  const caja = obj(j.caja);
  const par = (v: unknown) => ({ monto: num(obj(v).monto), cantidad: num(obj(v).cantidad) });
  const terna = (v: unknown) => ({ entradas: num(obj(v).entradas), salidas: num(obj(v).salidas), cantidad: num(obj(v).cantidad) });
  const cta = j.cuenta_venta_activos && typeof j.cuenta_venta_activos === 'object' ? obj(j.cuenta_venta_activos) : null;
  return {
    hoy: String(j.hoy ?? ''),
    moneda: j.moneda === 'USD' ? 'USD' : 'CLP',
    semanas: num(j.semanas),
    hasta: String(j.hasta ?? ''),
    conDudosas: j.con_dudosas === true,
    conViajes: j.con_viajes !== false,
    puedeEditar: j.puede_editar === true,
    caja: {
      total: num(caja.total),
      cuentas: arr(caja.cuentas).map((c) => ({
        id: num(c.id),
        nombre: String(c.nombre ?? ''),
        tipo: c.tipo === 'caja' ? 'caja' : 'banco',
        moneda: String(c.moneda ?? 'CLP'),
        saldo: num(c.saldo),
        saldoVista: numN(c.saldo_vista),
        cartolaFecha: txt(c.cartola_fecha),
        cartolaSaldo: numN(c.cartola_saldo),
        porConciliar: num(c.por_conciliar),
      })),
    },
    plan: arr(j.plan).map((s) => ({
      n: num(s.n),
      desde: String(s.desde ?? ''),
      hasta: String(s.hasta ?? ''),
      entradas: num(s.entradas),
      salidas: num(s.salidas),
      neto: num(s.neto),
      saldo: num(s.saldo),
      saldoPrudente: num(s.saldo_prudente),
    })),
    resumen: {
      entradas: num(r.entradas),
      salidas: num(r.salidas),
      saldoFinal: num(r.saldo_final),
      saldoMinimo: punto(r.saldo_minimo),
      primeraNegativa: falta(r.primera_negativa),
      prudenteMinimo: punto(r.prudente_minimo),
      prudentePrimeraNegativa: falta(r.prudente_primera_negativa),
      sinFechaCobrar: par(r.sin_fecha_cobrar),
      sinFechaPagar: par(r.sin_fecha_pagar),
      despuesEntradas: num(r.despues_entradas),
      despuesSalidas: num(r.despues_salidas),
      dudosasSinContar: terna(r.dudosas_sin_contar),
      noContar: terna(r.no_contar),
    },
    partidas: arr(j.partidas).map((p) => ({
      clave: String(p.clave ?? `${String(p.origen)}:${String(p.id)}`),
      origen: String(p.origen ?? 'partida') as OrigenPlan,
      id: num(p.id),
      sentido: p.sentido === 'salida' ? 'salida' : 'entrada',
      grupo: String(p.grupo ?? ''),
      titulo: String(p.titulo ?? ''),
      detalle: txt(p.detalle),
      fecha: txt(p.fecha),
      fechaBase: txt(p.fecha_base),
      supuesto: txt(p.supuesto),
      moneda: String(p.moneda ?? 'CLP'),
      monto: num(p.monto),
      montoVista: numN(p.monto_vista),
      certeza: certeza(p.certeza),
      cubo: CUBOS.find((c) => c === p.cubo) ?? 'semana',
      semana: numN(p.semana),
      cuenta: p.cuenta === true,
      nota: txt(p.nota),
      ajustada: p.ajustada === true,
      fechaCargada: txt(p.fecha_cargada),
      certezaCargada: CERTEZAS.find((c) => c === p.certeza_cargada) ?? null,
      ajustable: p.ajustable === true,
      soloContar: p.solo_contar === true,
      atrasada: p.atrasada === true,
      categoria: txt(p.categoria),
      tercero: txt(p.tercero),
      descripcion: txt(p.descripcion),
      version: numN(p.version),
    })),
    avisos: (Array.isArray(j.avisos) ? j.avisos : []).map((a) => String(a)),
    cuentaVentaActivos: cta ? { codigo: String(cta.codigo ?? ''), nombre: String(cta.nombre ?? '') } : null,
    categorias: arr(j.categorias).map((k) => ({ codigo: String(k.codigo ?? ''), tipo: k.tipo === 'salida' ? 'salida' : 'entrada', nombre: String(k.nombre ?? '') })),
    cerradas: arr(j.cerradas).map((c) => ({
      id: num(c.id),
      tipo: c.tipo === 'salida' ? 'salida' : 'entrada',
      descripcion: String(c.descripcion ?? ''),
      tercero: txt(c.tercero),
      fecha: String(c.fecha ?? ''),
      moneda: String(c.moneda ?? 'CLP'),
      monto: num(c.monto),
      estado: c.estado === 'anulada' ? 'anulada' : 'cumplida',
      cerradaEn: txt(c.cerrada_en),
    })),
  };
}

/** Los renglones del plan, en el orden en que se muestran. */
export const GRUPOS_PLAN: readonly { codigo: string; sentido: Sentido; nombre: string }[] = [
  { codigo: 'facturas', sentido: 'entrada', nombre: 'Cobranzas de facturas' },
  { codigo: 'por_facturar', sentido: 'entrada', nombre: 'Prefacturas y viajes sin facturar' },
  { codigo: 'previstas_entrada', sentido: 'entrada', nombre: 'Ventas de activos y otras entradas previstas' },
  { codigo: 'proveedores', sentido: 'salida', nombre: 'Proveedores y gastos' },
  { codigo: 'fijos', sentido: 'salida', nombre: 'Cuotas y gastos fijos' },
  { codigo: 'sueldos', sentido: 'salida', nombre: 'Sueldos de choferes' },
  { codigo: 'combustible', sentido: 'salida', nombre: 'Combustible y fondos a choferes' },
  { codigo: 'previstas_salida', sentido: 'salida', nombre: 'Otras salidas previstas' },
];

export interface GrupoPartidas {
  codigo: string;
  nombre: string;
  sentido: Sentido;
  /** Suma de lo que cuenta, en la moneda en que se mira el plan. */
  total: number;
  partidas: PartidaPlan[];
}

/** Junta las partidas por renglón del plan (primero las entradas), con el total de lo que cuenta. */
export function agruparPartidas(partidas: PartidaPlan[]): GrupoPartidas[] {
  const grupos: GrupoPartidas[] = [];
  for (const g of GRUPOS_PLAN) {
    const suyas = partidas.filter((p) => p.grupo === g.codigo);
    if (suyas.length === 0) continue;
    grupos.push({ ...g, total: suyas.reduce((a, p) => a + (p.cuenta ? (p.montoVista ?? 0) : 0), 0), partidas: suyas });
  }
  // Por si la base manda un renglón que la web todavía no conoce
  const otras = partidas.filter((p) => !GRUPOS_PLAN.some((g) => g.codigo === p.grupo));
  for (const sentido of ['entrada', 'salida'] as const) {
    const suyas = otras.filter((p) => p.sentido === sentido);
    if (suyas.length > 0) {
      grupos.push({
        codigo: `otras_${sentido}`,
        nombre: sentido === 'entrada' ? 'Otras entradas' : 'Otras salidas',
        sentido,
        total: suyas.reduce((a, p) => a + (p.cuenta ? (p.montoVista ?? 0) : 0), 0),
        partidas: suyas,
      });
    }
  }
  return grupos.sort((a, b) => (a.sentido === b.sentido ? 0 : a.sentido === 'entrada' ? -1 : 1));
}

export const partidasDeSemana = (plan: PlanCaja, n: number) => plan.partidas.filter((p) => p.cubo === 'semana' && p.semana === n);
export const partidasDeCubo = (plan: PlanCaja, cubo: Cubo, sentido?: Sentido) =>
  plan.partidas.filter((p) => p.cubo === cubo && (sentido === undefined || p.sentido === sentido));

/** «Esta semana» o «Semana del 30/11». */
export function etiquetaSemana(s: Pick<SemanaPlan, 'n' | 'desde'>): string {
  return s.n === 0 ? 'Esta semana' : `Semana del ${formatearFechaDia(s.desde).slice(0, 5)}`;
}

/** La frase que resume el plan: si la caja alcanza y, si no, cuándo falta y cuánto. */
export function situacionPlan(plan: Pick<PlanCaja, 'resumen' | 'moneda' | 'semanas'>): { tono: 'bien' | 'justo' | 'mal'; texto: string } {
  const { resumen: r, moneda } = plan;
  if (r.primeraNegativa) {
    const s = r.primeraNegativa;
    return {
      tono: 'mal',
      texto: `Con lo previsto, la caja no alcanza ${s.n === 0 ? 'esta semana' : `la semana del ${formatearFechaDia(s.desde).slice(0, 5)}`}: faltan ${dinero(s.falta, moneda)}.`,
    };
  }
  if (r.prudentePrimeraNegativa) {
    const s = r.prudentePrimeraNegativa;
    return {
      tono: 'justo',
      texto: `Con lo previsto la caja alcanza las ${plan.semanas} semanas, pero depende de cobros que no son seguros: si solo entra lo seguro, faltan ${dinero(s.falta, moneda)} ${
        s.n === 0 ? 'esta semana' : `la semana del ${formatearFechaDia(s.desde).slice(0, 5)}`
      }.`,
    };
  }
  return {
    tono: 'bien',
    texto: `Con lo previsto, la caja alcanza las ${plan.semanas} semanas${r.saldoMinimo ? ` y no baja de ${dinero(r.saldoMinimo.saldo, moneda)}` : ''}.`,
  };
}

/** Lo que se le manda a la base para armar el plan. */
export interface OpcionesPlan {
  moneda: MonedaPlan;
  semanas: number;
  conViajes: boolean;
  conDudosas: boolean;
}
export const OPCIONES_PLAN_INICIAL: OpcionesPlan = { moneda: 'CLP', semanas: 13, conViajes: true, conDudosas: false };
export const SEMANAS_PLAN = [4, 8, 13, 26] as const;

// ───────────────────────── Lo que se guarda (la base vuelve a validar todo) ─────────────────────────
const fechaIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Elegí la fecha.');
const textoOpc = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} letras.`)
    .nullish()
    .transform((v) => (v ? v : null));
const idSchema = z.number().int().positive();

export const ajustarPlanSchema = z.object({
  origen: z.enum(ORIGENES_AJUSTABLES),
  id: idSchema,
  fecha: fechaIso.nullable(),
  contar: z.boolean(),
  certeza: z.enum(CERTEZAS).nullable(),
  nota: textoOpc(300),
});
export type AjustePlanEntrada = z.infer<typeof ajustarPlanSchema>;

export const REPETIR = ['no', 'semana', 'quincena', 'mes'] as const;
export type Repetir = (typeof REPETIR)[number];
export const ETIQUETA_REPETIR: Record<Repetir, string> = { no: 'No se repite', semana: 'Cada semana', quincena: 'Cada 15 días', mes: 'Cada mes' };

export const partidaCajaSchema = z.object({
  id: idSchema.nullable(),
  version: z.number().int().nullable(),
  tipo: z.enum(['entrada', 'salida']),
  categoria: z.string().min(1, 'Elegí de qué se trata.'),
  descripcion: z.string().trim().min(3, 'Escribí qué es.').max(200, 'Máximo 200 letras.'),
  tercero: textoOpc(120),
  fecha: fechaIso,
  moneda: z.string().length(3, 'Elegí la moneda.'),
  monto: numeroOpc.refine((v) => v !== null && v > 0, 'Escribí el monto.'),
  certeza: z.enum(CERTEZAS),
  nota: textoOpc(300),
  repetir: z.object({ cada: z.enum(REPETIR), veces: z.number().int().min(1).max(24, 'Hasta 24 veces.') }),
});
export type PartidaCajaEntrada = z.infer<typeof partidaCajaSchema>;

export const cerrarPartidaSchema = z.object({ id: idSchema, accion: z.enum(['cumplida', 'anulada', 'reabrir']), fecha: fechaIso.nullable() });
export type CerrarPartidaEntrada = z.infer<typeof cerrarPartidaSchema>;
