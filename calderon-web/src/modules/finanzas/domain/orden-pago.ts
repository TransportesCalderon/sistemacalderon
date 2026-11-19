import { z } from 'zod';
import { numeroOpc } from '@/modules/ventas/domain/ventas.schemas';

/** Migración 281 · Cuenta corriente de proveedores y órdenes de pago: lo que devuelve la base. */
type Obj = Record<string, unknown>;
const num = (v: unknown): number => (v === null || v === undefined || v === '' ? 0 : Number(v));
const numN = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));
const txt = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v));
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? (v as Obj[]) : []);

/** Un proveedor en una moneda: lo que se le debe, lo que tiene a cuenta y el saldo. */
export interface SaldoProveedor {
  proveedorId: number;
  proveedor: string;
  moneda: string;
  facturas: number;
  facturasSaldo: number;
  cargas: number;
  cargasImporte: number;
  aCuenta: number;
  saldo: number;
  vencido: number;
}

export function parsearSaldosProveedores(raw: unknown): SaldoProveedor[] {
  return arr(raw).map((x) => ({
    proveedorId: num(x.proveedor_id),
    proveedor: String(x.proveedor ?? ''),
    moneda: String(x.moneda ?? 'CLP'),
    facturas: num(x.facturas),
    facturasSaldo: num(x.facturas_saldo),
    cargas: num(x.cargas),
    cargasImporte: num(x.cargas_importe),
    aCuenta: num(x.a_cuenta),
    saldo: num(x.saldo),
    vencido: num(x.vencido),
  }));
}

export type TipoMovimientoProveedor = 'factura' | 'pago' | 'orden_pago' | 'carga';

export interface MovimientoProveedor {
  tipo: TipoMovimientoProveedor;
  id: number;
  fecha: string;
  numero: string;
  detalle: string;
  debe: number;
  haber: number;
  saldo: number;
  vence: string | null;
  /** Factura: lo que falta pagar. Orden de pago: lo que queda a cuenta. */
  pendiente: number | null;
  cuenta: string | null;
  ordenPagoId: number | null;
}

export interface CuentaProveedor {
  proveedorId: number;
  proveedor: string;
  moneda: string;
  saldo: number;
  aCuenta: number;
  movimientos: MovimientoProveedor[];
}

export function parsearCuentaProveedor(raw: unknown): CuentaProveedor {
  const j = (raw ?? {}) as Obj;
  return {
    proveedorId: num(j.proveedor_id),
    proveedor: String(j.proveedor ?? ''),
    moneda: String(j.moneda ?? 'CLP'),
    saldo: num(j.saldo),
    aCuenta: num(j.a_cuenta),
    movimientos: arr(j.movimientos).map((m) => ({
      tipo: String(m.tipo) as TipoMovimientoProveedor,
      id: num(m.id),
      fecha: String(m.fecha ?? ''),
      numero: String(m.numero ?? ''),
      detalle: String(m.detalle ?? ''),
      debe: num(m.debe),
      haber: num(m.haber),
      saldo: num(m.saldo),
      vence: txt(m.vence),
      pendiente: numN(m.pendiente),
      cuenta: txt(m.cuenta),
      ordenPagoId: numN(m.orden_pago_id),
    })),
  };
}

export interface OrdenPagoCreada {
  id: number;
  numero: string;
  aCuenta: number;
}

export function parsearOrdenPagoCreada(raw: unknown): OrdenPagoCreada {
  const j = (raw ?? {}) as Obj;
  return { id: num(j.id), numero: String(j.numero ?? ''), aCuenta: num(j.a_cuenta) };
}

export const ETIQUETA_MOVIMIENTO_PROVEEDOR: Record<TipoMovimientoProveedor, string> = {
  factura: 'Factura',
  pago: 'Pago',
  orden_pago: 'Orden de pago',
  carga: 'Carga sin factura',
};

/** Forma de los formularios (las reglas las decide la base). Van acá y no en las acciones: un archivo «use server» solo admite funciones async. */
const idSchema = z.number().int().positive();
export const ordenPagoSchema = z.object({
  proveedorId: idSchema,
  cuentaDineroId: idSchema,
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Elegí la fecha.'),
  monto: numeroOpc.refine((v) => v !== null && v > 0, 'Escribí cuánto salió.'),
  moneda: z.string().length(3),
  montoDeuda: numeroOpc,
  observacion: z
    .string()
    .trim()
    .max(500)
    .nullish()
    .transform((v) => (v ? v : null)),
});
export const aplicarACuentaSchema = z.object({ proveedorId: idSchema });
export const anularOrdenPagoSchema = z.object({ id: idSchema, motivo: z.string().trim().min(1, 'Escribí el motivo.').max(500) });
