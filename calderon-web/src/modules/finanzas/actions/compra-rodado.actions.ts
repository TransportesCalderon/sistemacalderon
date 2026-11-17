'use server';

import { z } from 'zod';
import { createAction } from '@/server/actions/create-action';
import { compraRodadoRepository } from '../repositories/compra-rodado.repository';

/** Compra de vehículos con documentos (17/11/2026). La base exige Finanzas o TI y valida los montos. */
const id = z.number().int().positive();
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Elegí la fecha.');
const monto = z.number().min(0).max(99_999_999_999);
const RUTAS = { paths: ['/finanzas'] };

export const registrarCompraRodado = createAction({
  permiso: 'finanzas.gastos:editar',
  schema: z.object({
    camionId: id.nullable(),
    semiId: id.nullable(),
    fecha,
    proveedorId: id.nullable(),
    valorNeto: monto,
    iva: monto,
    pie: monto,
    piePagadoAntes: z.boolean(),
    documentos: z.number().int().min(0).max(240),
    montoDocumento: monto,
    primerVencimiento: fecha.nullable(),
    documentosPrevios: z.number().int().min(0).max(240),
    vidaUtilMeses: z.number().int().min(0).max(600),
    valorResidual: monto,
    observacion: z.string().trim().max(500).nullable(),
  }),
  handler: (d, { db }) => compraRodadoRepository(db).registrar(d),
  invalida: () => RUTAS,
});

export const anularCompraRodado = createAction({
  permiso: 'finanzas.gastos:transicionar',
  schema: z.object({ id, motivo: z.string().trim().min(1, 'Escribí el motivo.').max(500) }),
  handler: (d, { db }) => compraRodadoRepository(db).anular(d.id, d.motivo),
  invalida: () => RUTAS,
});
