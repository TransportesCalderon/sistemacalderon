'use server';

import { createAction } from '@/server/actions/create-action';
import { anularOrdenPagoSchema, aplicarACuentaSchema, ordenPagoSchema } from '../domain/orden-pago';
import { ordenPagoRepository } from '../repositories/orden-pago.repository';

/** Migración 281 · Órdenes de pago a proveedores. La base exige Finanzas o TI y valida montos, monedas y saldos. */
const RUTAS = { paths: ['/finanzas'] };

export const registrarOrdenPago = createAction({
  permiso: 'finanzas.cobros_pagos:editar',
  schema: ordenPagoSchema,
  handler: (d, { db }) => ordenPagoRepository(db).registrar({ ...d, monto: d.monto ?? 0 }),
  invalida: () => RUTAS,
});

export const aplicarPagosACuenta = createAction({
  permiso: 'finanzas.cobros_pagos:editar',
  schema: aplicarACuentaSchema,
  handler: (d, { db }) => ordenPagoRepository(db).aplicarACuenta(d.proveedorId),
  invalida: () => RUTAS,
});

export const anularOrdenPago = createAction({
  permiso: 'finanzas.cobros_pagos:transicionar',
  schema: anularOrdenPagoSchema,
  handler: (d, { db }) => ordenPagoRepository(db).anular(d.id, d.motivo),
  invalida: () => RUTAS,
});
