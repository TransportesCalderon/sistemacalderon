import { z } from 'zod';

/** Migración 284 · A qué cuenta se le transfiere el dinero del viaje al chofer (una por moneda). */
export interface CuentaTransferencia {
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
  return { moneda: texto(o.moneda) ?? '', banco, tipoCuenta: texto(o.tipo_cuenta), numero, titular, titularDocumento: texto(o.titular_documento) };
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
export const miCuentaTransferenciaSchema = z.object(datos);
export const cuentaTransferenciaChoferSchema = z.object({ ...datos, choferId: z.number().int().positive() });
