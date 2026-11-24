'use server';

import { createAction } from '@/server/actions/create-action';
import { cuentaTransferenciaChoferSchema, elegirCuentaPedidoSchema, miCuentaTransferenciaSchema, quitarCuentaSchema } from '../domain/cuenta-transferencia';

/** Migración 284 · La cuenta a la que se le transfiere al chofer. La base decide quién puede y valida los datos. */
interface Datos {
  moneda: string;
  banco: string;
  tipoCuenta: string;
  numero: string;
  titular: string;
  titularDocumento: string;
  id?: number | null;
  nueva?: boolean;
  principal?: boolean;
}
function aBase(d: Datos) {
  return {
    banco: d.banco,
    tipo_cuenta: d.tipoCuenta,
    numero: d.numero,
    titular: d.titular,
    titular_documento: d.titularDocumento,
    // Migración 303: qué cuenta se cambia, si es otra nueva y si pasa a ser la principal
    ...(d.id ? { id: d.id } : {}),
    ...(d.nueva ? { nueva: true } : {}),
    ...(d.principal ? { principal: true } : {}),
  };
}

/** El chofer guarda la suya. */
export const guardarMiCuentaTransferencia = createAction({
  permiso: 'chofer.mis_gastos:editar',
  schema: miCuentaTransferenciaSchema,
  handler: async (d, { db }) => {
    const { data, error } = await db.schema('fin').rpc('fn_guardar_cuenta_transferencia', { p_chofer: null, p_moneda: d.moneda, p_datos: aBase(d) });
    if (error) throw error;
    return data as { id?: number } | null;
  },
});

/** Quien pide, autoriza o paga guarda la de un chofer (Migración 303: también Gerencia, TI y RRHH desde la ficha). */
export const guardarCuentaTransferenciaChofer = createAction({
  permiso: ['rrhh.fondos:ver', 'flota.choferes:editar'],
  schema: cuentaTransferenciaChoferSchema,
  handler: async (d, { db }) => {
    const { data, error } = await db.schema('fin').rpc('fn_guardar_cuenta_transferencia', { p_chofer: d.choferId, p_moneda: d.moneda, p_datos: aBase(d) });
    if (error) throw error;
    return data as { id?: number } | null;
  },
});

/** Migración 303 · Quitar una cuenta (la base decide quién: el chofer las suyas; la oficina las de cualquiera). */
export const quitarCuentaTransferencia = createAction({
  permiso: ['chofer.mis_gastos:editar', 'rrhh.fondos:ver', 'flota.choferes:editar'],
  schema: quitarCuentaSchema,
  handler: async (d, { db }) => {
    const { error } = await db.schema('fin').rpc('fn_quitar_cuenta_transferencia', { p_cuenta: d.cuentaId });
    if (error) throw error;
    return null;
  },
});

/** Migración 303 · A qué cuenta va un pedido sin pagar (el chofer en los suyos; la oficina en todos). */
export const elegirCuentaPedido = createAction({
  permiso: ['chofer.mis_gastos:editar', 'rrhh.fondos:ver'],
  schema: elegirCuentaPedidoSchema,
  handler: async (d, { db }) => {
    const { error } = await db.schema('fin').rpc('fn_elegir_cuenta_pedido', { p_pedido: d.pedidoId, p_cuenta: d.cuentaId });
    if (error) throw error;
    return null;
  },
});
