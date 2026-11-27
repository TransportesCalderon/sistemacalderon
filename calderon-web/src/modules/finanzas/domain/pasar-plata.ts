import { z } from 'zod';
import { numeroOpc } from '@/modules/ventas/domain/ventas.schemas';
import { formatearNumero } from '@/shared/lib/numeros';
import { dinero } from './finanzas.types';

/**
 * Migración 388 · Las cuentas en «Hoy» y transferir entre cuentas (fin.fn_cuentas_hoy, fin.fn_pasar_plata).
 * La base trae cada cuenta con su saldo en su moneda, decide quién puede transferir y valida todo (fechas, montos,
 * cambio que no cierra, repetidos). Acá solo se convierten tipos y se arma el texto del cambio mientras se escribe.
 */
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? (v as Obj[]) : []);
const num = (v: unknown): number => (v === null || v === undefined || v === '' ? 0 : Number(v));
const numN = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));
const txt = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v));

export interface CuentaHoy {
  id: number;
  nombre: string;
  tipo: 'banco' | 'caja';
  moneda: string;
  /** En la moneda de la cuenta. */
  saldo: number;
  /** En pesos chilenos al cambio de hoy; null si falta el cambio de esa moneda. */
  saldoClp: number | null;
  /** Hasta qué día trae movimientos la cartola importada (null: sin cartola). */
  cartolaFecha: string | null;
  /** Tarjeta de flota prepaga (migración 376). */
  tarjeta: boolean;
}

export interface TransferenciaHoy {
  id: number;
  numero: string;
  fecha: string;
  desde: string;
  desdeMoneda: string;
  salio: number;
  hacia: string;
  haciaMoneda: string;
  llego: number;
  descripcion: string | null;
  conciliada: boolean;
  puedeAnular: boolean;
}

export interface CuentasHoy {
  hoy: string;
  /** La base deja transferir a este usuario (Finanzas, Gerencia o TI). */
  puede: boolean;
  cuentas: CuentaHoy[];
  /** Cuántos pesos chilenos vale hoy una unidad de cada moneda (sin CLP). */
  cambios: Record<string, number>;
  desvioMaxPct: number;
  ultimas: TransferenciaHoy[];
}

export function parsearCuentasHoy(raw: unknown): CuentasHoy {
  const j = obj(raw);
  const cambios: Record<string, number> = {};
  for (const [moneda, v] of Object.entries(obj(j.cambios))) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) cambios[moneda] = n;
  }
  return {
    hoy: String(j.hoy ?? ''),
    puede: j.puede === true,
    cuentas: arr(j.cuentas).map((c) => ({
      id: num(c.id),
      nombre: String(c.nombre ?? ''),
      tipo: c.tipo === 'caja' ? 'caja' : 'banco',
      moneda: String(c.moneda ?? 'CLP'),
      saldo: num(c.saldo),
      saldoClp: numN(c.saldo_clp),
      cartolaFecha: txt(c.cartola_fecha),
      tarjeta: c.tarjeta === true,
    })),
    cambios,
    desvioMaxPct: num(j.desvio_max_pct) || 30,
    ultimas: arr(j.ultimas).map((m) => ({
      id: num(m.id),
      numero: String(m.numero ?? ''),
      fecha: String(m.fecha ?? ''),
      desde: String(m.desde ?? ''),
      desdeMoneda: String(m.desde_moneda ?? 'CLP'),
      salio: num(m.salio),
      hacia: String(m.hacia ?? ''),
      haciaMoneda: String(m.hacia_moneda ?? 'CLP'),
      llego: num(m.llego),
      descripcion: txt(m.descripcion),
      conciliada: m.conciliado === true,
      puedeAnular: m.puede_anular === true,
    })),
  };
}

/** Lo que contesta la base al anotar una transferencia. */
export interface TransferenciaHecha {
  id: number | null;
  numero: string | null;
  /** «USD 1.000,00 de … → CLP 990.000 en … · 1 USD = 990,00 CLP (el del día: 1.002,07)». */
  resumen: string;
  avisos: string[];
}

export function parsearTransferenciaHecha(raw: unknown): TransferenciaHecha {
  const j = obj(raw);
  return {
    id: numN(j.id),
    numero: txt(j.numero),
    resumen: String(j.resumen ?? ''),
    avisos: Array.isArray(j.avisos) ? j.avisos.map(String) : [],
  };
}

/** El total en pesos de hoy (lo que no tiene cambio cargado no suma) y las cuentas que quedaron afuera. */
export function totalEnPesos(cuentas: readonly CuentaHoy[]): { total: number; sinCambio: string[] } {
  let total = 0;
  const sinCambio: string[] = [];
  for (const c of cuentas) {
    if (c.saldoClp === null) sinCambio.push(c.moneda);
    else total += c.saldoClp;
  }
  return { total, sinCambio: [...new Set(sinCambio)] };
}

/** Texto de un campo de monto → número (mismas reglas que el servidor: «1.234,56», «1234.56», «1.800»); null si no hay. */
export function montoEscrito(texto: string): number | null {
  const r = numeroOpc.safeParse(texto);
  return r.success && r.data !== null && r.data > 0 ? r.data : null;
}

/** Pesos chilenos por unidad de una moneda, hoy (CLP = 1); null si falta el cambio. */
export const pesosPor = (moneda: string, cambios: Record<string, number>): number | null => (moneda === 'CLP' ? 1 : (cambios[moneda] ?? null));

export interface CambioQueSale {
  /** «1 USD = 990,00 CLP». */
  texto: string;
  /** El del día, dicho igual; null si falta el cambio de alguna de las dos monedas. */
  delDia: string | null;
  /** Cuánto se aleja del cambio del día, en % (positivo o negativo); null si no se puede comparar. */
  desvioPct: number | null;
}

/**
 * El cambio que sale de lo escrito, poniendo adelante la moneda que vale más («1 USD = 990,00 CLP»), para mostrarlo
 * mientras se escribe. Es solo una ayuda: la que acepta o rechaza es la base.
 */
export function cambioQueSale(
  desde: Pick<CuentaHoy, 'moneda'>,
  hacia: Pick<CuentaHoy, 'moneda'>,
  salio: number | null,
  llego: number | null,
  cambios: Record<string, number>,
): CambioQueSale | null {
  if (desde.moneda === hacia.moneda || !salio || !llego || salio <= 0 || llego <= 0) return null;
  const tcDesde = pesosPor(desde.moneda, cambios);
  const tcHacia = pesosPor(hacia.moneda, cambios);
  // Sin el cambio del día no se sabe cuál vale más: se dice desde la moneda que sale
  const fuerteEsDesde = tcDesde === null || tcHacia === null ? true : tcDesde >= tcHacia;
  const fuerte = fuerteEsDesde ? desde.moneda : hacia.moneda;
  const debil = fuerteEsDesde ? hacia.moneda : desde.moneda;
  const tasa = fuerteEsDesde ? llego / salio : salio / llego;
  const delDia = tcDesde === null || tcHacia === null ? null : fuerteEsDesde ? tcDesde / tcHacia : tcHacia / tcDesde;
  const dec = (x: number) => (x < 10 ? 4 : 2);
  return {
    texto: `1 ${fuerte} = ${formatearNumero(tasa, dec(tasa))} ${debil}`,
    delDia: delDia === null ? null : `1 ${fuerte} = ${formatearNumero(delDia, dec(delDia))} ${debil}`,
    desvioPct: delDia === null ? null : (tasa / delDia - 1) * 100,
  };
}

/** «US$ 1.000,00 → $ 990.000», o un solo monto si la moneda es la misma. */
export function montosDe(t: Pick<TransferenciaHoy, 'salio' | 'desdeMoneda' | 'llego' | 'haciaMoneda'>): string {
  return t.desdeMoneda === t.haciaMoneda ? dinero(t.salio, t.desdeMoneda) : `${dinero(t.salio, t.desdeMoneda)} → ${dinero(t.llego, t.haciaMoneda)}`;
}

// ---------------------------------------------------------------------------
// Formularios (la forma; las reglas las decide la base)
// ---------------------------------------------------------------------------
const idCuenta = (mensaje: string) => z.number({ error: mensaje }).int().positive(mensaje);

export const pasarPlataSchema = z.object({
  desdeId: idCuenta('Elegí de qué cuenta sale la plata.'),
  haciaId: idCuenta('Elegí a qué cuenta llega la plata.'),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Elegí la fecha.'),
  salio: numeroOpc.refine((v) => v !== null && v > 0, 'Escribí cuánto salió.'),
  /** Solo si las cuentas son de monedas distintas. */
  llego: numeroOpc,
  descripcion: z
    .string()
    .trim()
    .max(200, 'Máximo 200 letras.')
    .nullish()
    .transform((v) => (v ? v : null)),
});
export type PasarPlataEntrada = z.infer<typeof pasarPlataSchema>;

export const anularTransferenciaSchema = z.object({
  id: z.number().int().positive(),
  motivo: z.string().trim().min(1, 'Escribí el motivo.').max(500, 'Máximo 500 letras.'),
});
export type AnularTransferenciaEntrada = z.infer<typeof anularTransferenciaSchema>;
