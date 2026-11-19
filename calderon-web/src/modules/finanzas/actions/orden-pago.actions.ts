'use server';

import { z } from 'zod';
import { createAction } from '@/server/actions/create-action';
import { numeroOpc } from '@/modules/ventas/domain/ventas.schemas';
import { ordenPagoRepository } from '../repositories/orden-pago.repository';

/** Migración 281 · Órdenes de pago a proveedores. La base exige Finanzas o TI y valida montos, monedas y saldos. */
const id = z.number().int().positive();
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Elegí la fecha.');
const RUTAS = { paths: ['/finanzas'] };

export const registrarOrdenPago = createAction({
  permiso: 'finanzas.cobros_pagos:editar',
  schema: z.object({
    proveedorId: id,
    cuentaDineroId: id,
    fecha,
    monto: numeroOpc.refine((v) => v !== null && v > 0, 'Escribí cuánto salió.'),
    moneda: z.string().length(3),
    montoDeuda: numeroOpc,
    observacion: z
      .string()
      .trim()
      .max(500)
      .nullish()
      .transform((v) => (v ? v : null)),
  }),
  handler: (d, { db }) => ordenPagoRepository(db).registrar({ ...d, monto: d.monto ?? 0 }),
  invalida: () => RUTAS,
});

export const aplicarPagosACuenta = createAction({
  permiso: 'finanzas.cobros_pagos:editar',
  schema: z.object({ proveedorId: id }),
  handler: (d, { db }) => ordenPagoRepository(db).aplicarACuenta(d.proveedorId),
  invalida: () => RUTAS,
});

export const anularOrdenPago = createAction({
  permiso: 'finanzas.cobros_pagos:transicionar',
  schema: z.object({ id, motivo: z.string().trim().min(1, 'Escribí el motivo.').max(500) }),
  handler: (d, { db }) => ordenPagoRepository(db).anular(d.id, d.motivo),
  invalida: () => RUTAS,
});
