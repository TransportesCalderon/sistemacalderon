'use server';

import { createAction } from '@/server/actions/create-action';
import { cuentaTransferenciaChoferSchema, miCuentaTransferenciaSchema } from '../domain/cuenta-transferencia';

/** Migración 284 · La cuenta a la que se le transfiere al chofer. La base decide quién puede y valida los datos. */
interface Datos {
  moneda: string;
  banco: string;
  tipoCuenta: string;
  numero: string;
  titular: string;
  titularDocumento: string;
}
function aBase(d: Datos) {
  return { banco: d.banco, tipo_cuenta: d.tipoCuenta, numero: d.numero, titular: d.titular, titular_documento: d.titularDocumento };
}

/** El chofer guarda la suya. */
export const guardarMiCuentaTransferencia = createAction({
  permiso: 'chofer.mis_gastos:editar',
  schema: miCuentaTransferenciaSchema,
  handler: async (d, { db }) => {
    const { error } = await db.schema('fin').rpc('fn_guardar_cuenta_transferencia', { p_chofer: null, p_moneda: d.moneda, p_datos: aBase(d) });
    if (error) throw error;
    return null;
  },
});

/** Quien pide, autoriza o paga guarda la de un chofer. */
export const guardarCuentaTransferenciaChofer = createAction({
  permiso: 'rrhh.fondos:ver',
  schema: cuentaTransferenciaChoferSchema,
  handler: async (d, { db }) => {
    const { error } = await db.schema('fin').rpc('fn_guardar_cuenta_transferencia', { p_chofer: d.choferId, p_moneda: d.moneda, p_datos: aBase(d) });
    if (error) throw error;
    return null;
  },
});
