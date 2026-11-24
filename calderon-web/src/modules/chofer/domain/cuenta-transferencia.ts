import { z } from 'zod';

/** Migración 284 · A qué cuenta se le transfiere el dinero del viaje al chofer (una por moneda). */
export interface CuentaTransferencia {
  /** Migración 303: varias cuentas por chofer y moneda (null en pedidos viejos). */
  id: number | null;
  /** Migración 303: la que se propone sola en esa moneda. */
  principal: boolean;
  /** Migración 304: cuántas veces se le transfirió a esta cuenta en los últimos pagos y la última fecha. */
  veces: number;
  ultima: string | null;
  /** Migración 304: la que el sistema recomienda (la más usada; sin historial, la principal), con el motivo. */
  recomendada: boolean;
  motivoRecomendada: string | null;
  moneda: string;
  banco: string;
  tipoCuenta: string | null;
  numero: string;
  titular: string;
  titularDocumento: string | null;
}

export interface CuentaTransferenciaTexto {
  banco: string;
  tipoCuenta: string;
  numero: string;
  titular: string;
  titularDocumento: string;
}

export const CUENTA_VACIA: CuentaTransferenciaTexto = { banco: '', tipoCuenta: '', numero: '', titular: '', titularDocumento: '' };

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

export function parsearCuentaTransferencia(v: unknown): CuentaTransferencia | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  const banco = texto(o.banco);
  const numero = texto(o.numero);
  const titular = texto(o.titular);
  if (!banco || !numero || !titular) return null;
  const id = typeof o.id === 'number' ? o.id : typeof o.id === 'string' && /^\d+$/.test(o.id) ? Number(o.id) : null;
  return {
    id,
    principal: o.principal !== false,
    veces: typeof o.veces === 'number' ? o.veces : 0,
    ultima: texto(o.ultima),
    recomendada: o.recomendada === true,
    motivoRecomendada: texto(o.motivo_recomendada),
    moneda: texto(o.moneda) ?? '', banco, tipoCuenta: texto(o.tipo_cuenta), numero, titular, titularDocumento: texto(o.titular_documento) };
}

/** Migración 288 · Las monedas en que se le puede transferir al chofer. */
export const MONEDAS_CUENTA = ['ARS', 'CLP', 'USD'] as const;

/** Migración 288 · Todas las cuentas de un chofer (una por moneda). */
export function parsearCuentas(v: unknown): CuentaTransferencia[] {
  if (!Array.isArray(v)) return [];
  return v.map(parsearCuentaTransferencia).filter((c): c is CuentaTransferencia => c !== null);
}

/** Las cuentas de los pedidos sin pagar, por id de pedido. */
export function parsearCuentasDePedidos(v: unknown): Record<number, CuentaTransferencia> {
  const r: Record<number, CuentaTransferencia> = {};
  if (typeof v !== 'object' || v === null) return r;
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    const c = parsearCuentaTransferencia(x);
    if (c) r[Number(k)] = c;
  }
  return r;
}

export const aTexto = (c: CuentaTransferencia | null): CuentaTransferenciaTexto =>
  c ? { banco: c.banco, tipoCuenta: c.tipoCuenta ?? '', numero: c.numero, titular: c.titular, titularDocumento: c.titularDocumento ?? '' } : CUENTA_VACIA;

/** Lo que se copia para pegar en el banco. */
export const cuentaParaCopiar = (c: CuentaTransferencia): string =>
  [c.banco, c.tipoCuenta, c.numero, c.titular, c.titularDocumento].filter((x) => x).join('\n');

/** Solo forma: las reglas las aplica la base. */
const datos = {
  moneda: z.string().trim().length(3, 'Elegí la moneda.'),
  banco: z.string().trim().max(80, 'Máximo 80 caracteres.'),
  tipoCuenta: z.string().trim().max(40, 'Máximo 40 caracteres.'),
  numero: z.string().trim().max(60, 'Máximo 60 caracteres.'),
  titular: z.string().trim().max(120, 'Máximo 120 caracteres.'),
  titularDocumento: z.string().trim().max(30, 'Máximo 30 caracteres.'),
};
/** Migración 303: con id cambia esa cuenta; con nueva agrega otra; principal = la que se propone sola. */
const extra = { id: z.number().int().positive().nullable().optional(), nueva: z.boolean().optional(), principal: z.boolean().optional() };
export const miCuentaTransferenciaSchema = z.object({ ...datos, ...extra });
export const cuentaTransferenciaChoferSchema = z.object({ ...datos, ...extra, choferId: z.number().int().positive() });
export const quitarCuentaSchema = z.object({ cuentaId: z.number().int().positive() });
export const elegirCuentaPedidoSchema = z.object({ pedidoId: z.number().int().positive(), cuentaId: z.number().int().positive() });

/** Migración 303: lo que se muestra de una cuenta en una línea. */
export const cuentaEnUnaLinea = (c: CuentaTransferencia): string => `${c.banco} · ${c.numero} · ${c.titular}`;
