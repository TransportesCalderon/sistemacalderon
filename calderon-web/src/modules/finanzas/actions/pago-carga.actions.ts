'use server';

import { createAction } from '@/server/actions/create-action';
import { pagoCargaAnularSchema, pagoCargaTarjetaSchema, pagoCargaTransferirSchema } from '../domain/pago-carga';

/** Migración 290 · Lo que hace Finanzas con las cargas de Chile. La base exige Finanzas o TI y valida todo. */
const RUTAS = { paths: ['/analisis/cobros-pagos', '/finanzas'] };

export const pagoCargaTarjeta = createAction({
  permiso: 'finanzas.cobros_pagos:editar',
  schema: pagoCargaTarjetaSchema,
  handler: async (d, { db }) => {
    const { error } = await db.schema('fin').rpc('fn_pago_carga_tarjeta', { p_id: d.id, p_nota: d.nota || null });
    if (error) throw error;
    return null;
  },
  invalida: () => RUTAS,
});

export const pagoCargaTransferir = createAction({
  permiso: 'finanzas.cobros_pagos:editar',
  schema: pagoCargaTransferirSchema,
  handler: async (d, { db }) => {
    const { data, error } = await db.schema('fin').rpc('fn_pago_carga_transferir', {
      p_id: d.id,
      p_cuenta: d.cuentaId,
      p_fecha: d.fecha,
      p_monto: d.monto,
      p_monto_deuda: d.montoDeuda,
      p_observacion: d.observacion || null,
    });
    if (error) throw error;
    return { numero: String((data as { numero?: string } | null)?.numero ?? '') };
  },
  invalida: () => RUTAS,
});

export const pagoCargaAnular = createAction({
  permiso: 'finanzas.cobros_pagos:editar',
  schema: pagoCargaAnularSchema,
  handler: async (d, { db }) => {
    const { error } = await db.schema('fin').rpc('fn_pago_carga_anular', { p_id: d.id, p_motivo: d.motivo });
    if (error) throw error;
    return null;
  },
  invalida: () => RUTAS,
});
