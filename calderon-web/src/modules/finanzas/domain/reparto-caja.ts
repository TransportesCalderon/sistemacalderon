import { z } from 'zod';
import { numeroOpc } from '@/modules/ventas/domain/ventas.schemas';
import { dinero } from './finanzas.types';

/**
 * Migración 368 · Planificador de caja › «¿Qué hacemos con la plata?» (fin.fn_plan_caja_reparto).
 * Con la caja de hoy y la plata que entra, la base reparte paso por paso según las reglas de Gerencia: una cuota de
 * cada leasing o crédito, guardar para los sueldos, la espalda para operar y, con el resto, cancelar deudas vencidas.
 * Es una propuesta: no registra pagos. Acá solo se convierten tipos y se arma el texto del resumen.
 */
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? (v as Obj[]) : []);
const num = (v: unknown): number => (v === null || v === undefined || v === '' ? 0 : Number(v));
const numN = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));
const txt = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v));

export const PASOS_REPARTO = ['cuotas', 'sueldos', 'espalda', 'deudas'] as const;
export type PasoCodigo = (typeof PASOS_REPARTO)[number];
/** Cómo se nombra cada paso al ordenar las reglas. */
export const NOMBRE_PASO: Record<PasoCodigo, string> = {
  cuotas: 'Una cuota de cada leasing o crédito',
  sueldos: 'Guardar para los sueldos que vienen',
  espalda: 'Espalda para operar',
  deudas: 'Cancelar deudas vencidas',
};
const esPaso = (v: unknown): v is PasoCodigo => PASOS_REPARTO.some((p) => p === v);

/** A quién se le puede cargar el interés por mes: un contrato en cuotas, un proveedor o una deuda cargada a mano. */
export const TIPOS_MORA = ['fijo', 'proveedor', 'partida'] as const;
export type TipoMora = (typeof TIPOS_MORA)[number];
const esTipoMora = (v: unknown): v is TipoMora => TIPOS_MORA.some((t) => t === v);

export interface ItemReparto {
  clave: string;
  origen: string;
  titulo: string;
  detalle: string | null;
  /** Cuándo se piensa pagar según el plan. */
  fecha: string | null;
  vence: string | null;
  diasAtraso: number;
  moneda: string;
  monto: number;
  /** En pesos chilenos de hoy. */
  clp: number;
  clase: string;
  acreedorTipo: TipoMora | null;
  acreedorId: number | null;
  acreedor: string | null;
  /** Proveedor de combustible: sin él no se opera. */
  critico: boolean;
  /** Interés por mes (%) si se paga tarde; null si no se sabe. */
  tasa: number | null;
  tasaFuente: 'cargada' | 'observada' | null;
  tasaNota: string | null;
  /** En cuotas y deudas: si la plata alcanza para pagarla. null en los pasos que solo apartan plata. */
  sePaga: boolean | null;
  /** En «una cuota de cada contrato»: las otras cuotas vencidas del mismo contrato. */
  masVencidas: number;
  masVencidasClp: number;
}

export interface GastoOperativo {
  dias: number;
  combustible: number;
  fondos: number;
  aduana: number;
  total: number;
  porDia: number;
}

export interface PasoReparto {
  codigo: PasoCodigo;
  titulo: string;
  queEs: string;
  necesita: number;
  asignado: number;
  falta: number;
  quedaDespues: number;
  items: ItemReparto[];
  // Solo la espalda
  gastoOperativo: GastoOperativo | null;
  /** Combustible y fondos que el plan ya tiene anotados para estos días. */
  comprometido: number;
  diasQueCubre: number | null;
  diasQueCubririaCompleta: number | null;
}

export interface ReglasReparto {
  orden: PasoCodigo[];
  espalda: number;
  reservaSueldosDias: number;
  cuotasDias: number;
}

export interface RepartoCaja {
  hoy: string;
  dinero: { enCaja: number; usaCaja: boolean; entra: number; entraMoneda: string; entraClp: number; total: number };
  /** Las reglas con que se armó esta propuesta y las que están guardadas (pueden diferir si se está probando). */
  reglas: ReglasReparto & { guardadas: ReglasReparto };
  pasos: PasoReparto[];
  repartido: number;
  sobra: number;
  sinCubrir: number;
  vencePronto: { dias: number; monto: number; cantidad: number; items: ItemReparto[] };
  avisos: string[];
  puedeEditar: boolean;
}

const ORDEN_INICIAL: PasoCodigo[] = ['cuotas', 'sueldos', 'espalda', 'deudas'];
const reglas = (v: unknown): ReglasReparto => {
  const o = obj(v);
  const orden = (Array.isArray(o.orden) ? o.orden : []).filter(esPaso);
  return {
    orden: orden.length === PASOS_REPARTO.length ? orden : ORDEN_INICIAL,
    espalda: num(o.espalda),
    reservaSueldosDias: num(o.reserva_sueldos_dias),
    cuotasDias: num(o.cuotas_dias),
  };
};
const item = (e: Obj): ItemReparto => ({
  clave: String(e.clave ?? ''),
  origen: String(e.origen ?? ''),
  titulo: String(e.titulo ?? ''),
  detalle: txt(e.detalle),
  fecha: txt(e.fecha),
  vence: txt(e.vence),
  diasAtraso: num(e.dias_atraso),
  moneda: String(e.moneda ?? 'CLP'),
  monto: num(e.monto),
  clp: num(e.clp),
  clase: String(e.clase ?? ''),
  acreedorTipo: esTipoMora(e.acreedor_tipo) ? e.acreedor_tipo : null,
  acreedorId: numN(e.acreedor_id),
  acreedor: txt(e.acreedor),
  critico: e.critico === true,
  tasa: numN(e.tasa),
  tasaFuente: e.tasa_fuente === 'cargada' || e.tasa_fuente === 'observada' ? e.tasa_fuente : null,
  tasaNota: txt(e.tasa_nota),
  sePaga: typeof e.se_paga === 'boolean' ? e.se_paga : null,
  masVencidas: num(e.mas_vencidas),
  masVencidasClp: num(e.mas_vencidas_clp),
});

export function parsearRepartoCaja(raw: unknown): RepartoCaja {
  const j = obj(raw);
  const d = obj(j.dinero);
  const r = obj(j.reglas);
  const vp = obj(j.vence_pronto);
  return {
    hoy: String(j.hoy ?? ''),
    dinero: {
      enCaja: num(d.en_caja),
      usaCaja: d.usa_caja !== false,
      entra: num(d.entra),
      entraMoneda: String(d.entra_moneda ?? 'CLP'),
      entraClp: num(d.entra_clp),
      total: num(d.total),
    },
    reglas: { ...reglas(r), guardadas: reglas(r.guardadas) },
    pasos: arr(j.pasos)
      .filter((p) => esPaso(p.codigo))
      .map((p) => {
        const g = p.gasto_operativo && typeof p.gasto_operativo === 'object' ? obj(p.gasto_operativo) : null;
        return {
          codigo: p.codigo as PasoCodigo,
          titulo: String(p.titulo ?? ''),
          queEs: String(p.que_es ?? ''),
          necesita: num(p.necesita),
          asignado: num(p.asignado),
          falta: num(p.falta),
          quedaDespues: num(p.queda_despues),
          items: arr(p.items).map(item),
          gastoOperativo: g
            ? { dias: num(g.dias), combustible: num(g.combustible), fondos: num(g.fondos), aduana: num(g.aduana), total: num(g.total), porDia: num(g.por_dia) }
            : null,
          comprometido: num(p.comprometido),
          diasQueCubre: numN(p.dias_que_cubre),
          diasQueCubririaCompleta: numN(p.dias_que_cubriria_completa),
        };
      }),
    repartido: num(j.repartido),
    sobra: num(j.sobra),
    sinCubrir: num(j.sin_cubrir),
    vencePronto: { dias: num(vp.dias), monto: num(vp.monto), cantidad: num(vp.cantidad), items: arr(vp.items).map(item) },
    avisos: (Array.isArray(j.avisos) ? j.avisos : []).map((a) => String(a)),
    puedeEditar: j.puede_editar === true,
  };
}

/** Lo que se le pide a la base: la plata que entra y, si se está probando, otras reglas. */
export interface OpcionesReparto {
  entra: number;
  entraMoneda: string;
  usarCaja: boolean;
  /** null = las reglas guardadas. */
  prueba: ReglasReparto | null;
}
export const OPCIONES_REPARTO_INICIAL: OpcionesReparto = { entra: 0, entraMoneda: 'CLP', usarCaja: true, prueba: null };

/** ¿Se está mirando la propuesta con reglas distintas de las guardadas? */
export function reglasCambiadas(r: Pick<RepartoCaja, 'reglas'>): boolean {
  const { guardadas: g, ...a } = r.reglas;
  return a.espalda !== g.espalda || a.reservaSueldosDias !== g.reservaSueldosDias || a.cuotasDias !== g.cuotasDias || a.orden.join() !== g.orden.join();
}

/** Sube o baja un paso en el orden de las reglas. */
export function moverPaso(orden: PasoCodigo[], codigo: PasoCodigo, hacia: -1 | 1): PasoCodigo[] {
  const i = orden.indexOf(codigo);
  const j = i + hacia;
  if (i < 0 || j < 0 || j >= orden.length) return orden;
  const nuevo = [...orden];
  [nuevo[i], nuevo[j]] = [nuevo[j]!, nuevo[i]!];
  return nuevo;
}

/** La frase que resume la propuesta: cuánto hay, hasta dónde alcanza y qué queda. */
export function resumenReparto(r: RepartoCaja): { tono: 'bien' | 'justo' | 'mal'; texto: string } {
  const total = dinero(r.dinero.total, 'CLP');
  if (r.dinero.total <= 0) return { tono: 'mal', texto: 'No hay plata para repartir: cargá cuánto entra o importá las cartolas.' };
  const corto = r.pasos.find((p) => p.falta > 0);
  if (!corto) {
    return {
      tono: 'bien',
      texto: `Con ${total} alcanza para los cuatro pasos${r.sobra > 0 ? ` y sobran ${dinero(r.sobra, 'CLP')}` : ''}.`,
    };
  }
  const cubiertos = r.pasos.filter((p) => p.falta === 0 && p.necesita > 0).map((p) => NOMBRE_PASO[p.codigo].toLowerCase());
  return {
    tono: corto.codigo === 'deudas' ? 'justo' : 'mal',
    texto:
      `Con ${total} ${cubiertos.length ? `alcanza para ${cubiertos.join(', ')}` : 'no se llega a cubrir ningún paso entero'}; ` +
      `en «${NOMBRE_PASO[corto.codigo].toLowerCase()}» faltan ${dinero(corto.falta, 'CLP')}.`,
  };
}

/** «2,5 % por mes» */
export const textoTasa = (t: number) => `${String(Math.round(t * 100) / 100).replace('.', ',')} % por mes`;

// ───────────────────────── Lo que se guarda (la base vuelve a validar todo) ─────────────────────────
const dias = z.number().int('Sin decimales.').min(0, 'De 0 a 60.').max(60, 'De 0 a 60.');
export const reglasRepartoSchema = z.object({
  orden: z.array(z.enum(PASOS_REPARTO)).length(PASOS_REPARTO.length, 'Van los cuatro pasos.'),
  espalda: numeroOpc.refine((v) => v !== null && v >= 0, 'Escribí la espalda.'),
  reservaSueldosDias: dias,
  cuotasDias: dias,
});
export type ReglasRepartoEntrada = z.infer<typeof reglasRepartoSchema>;

export const moraCajaSchema = z.object({
  tipo: z.enum(TIPOS_MORA),
  id: z.number().int().positive(),
  /** Vacío = sacar lo cargado. */
  tasaMensual: numeroOpc.refine((v) => v === null || (v >= 0 && v <= 50), 'De 0 a 50.'),
  nota: z
    .string()
    .trim()
    .max(300, 'Máximo 300 letras.')
    .nullish()
    .transform((v) => (v ? v : null)),
});
export type MoraCajaEntrada = z.infer<typeof moraCajaSchema>;
