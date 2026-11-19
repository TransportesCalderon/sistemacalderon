import { RepoError, type Db } from '@/shared/repository/types';
import {
  parsearCuentaProveedor,
  parsearOrdenPagoCreada,
  parsearSaldosProveedores,
  type CuentaProveedor,
  type OrdenPagoCreada,
  type SaldoProveedor,
} from '../domain/orden-pago';

const ok = <T>(r: { data: T; error: unknown }): T => {
  if (r.error) throw new RepoError(r.error as never);
  return r.data;
};

export interface OrdenPagoEntrada {
  proveedorId: number;
  cuentaDineroId: number;
  fecha: string;
  /** Lo que salió del banco o de la caja, en la moneda de esa cuenta. */
  monto: number;
  /** Moneda de la deuda que se cancela. */
  moneda: string;
  /** Lo que se cancela en la moneda de la deuda (solo si es distinta de la del banco). */
  montoDeuda: number | null;
  observacion: string | null;
}

/** Migración 281 · Cobros y pagos › Por pagar: cuenta corriente de proveedores y órdenes de pago. La base valida todo. */
export function ordenPagoRepository(db: Db) {
  const fin = () => db.schema('fin');
  return {
    saldos: async (): Promise<SaldoProveedor[]> => parsearSaldosProveedores(ok(await fin().rpc('fn_cuenta_proveedores'))),
    cuenta: async (proveedorId: number, moneda: string): Promise<CuentaProveedor> =>
      parsearCuentaProveedor(ok(await fin().rpc('fn_cuenta_proveedor', { p_proveedor: proveedorId, p_moneda: moneda }))),
    registrar: async (d: OrdenPagoEntrada): Promise<OrdenPagoCreada> =>
      parsearOrdenPagoCreada(
        ok(
          await fin().rpc('fn_registrar_orden_pago', {
            p_datos: {
              proveedor_id: d.proveedorId,
              cuenta_dinero_id: d.cuentaDineroId,
              fecha: d.fecha,
              monto: d.monto,
              moneda: d.moneda,
              monto_deuda: d.montoDeuda,
              observacion: d.observacion,
            },
          }),
        ),
      ),
    aplicarACuenta: async (proveedorId: number): Promise<number> => ok(await fin().rpc('fn_aplicar_pagos_a_cuenta', { p_proveedor: proveedorId })) as number,
    anular: async (id: number, motivo: string) => {
      ok(await fin().rpc('fn_anular_orden_pago', { p_op: id, p_motivo: motivo }));
    },
  };
}
