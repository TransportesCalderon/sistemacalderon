'use server';

import { z } from 'zod';
import { createAction } from '@/server/actions/create-action';
import { ivaRecuperarRepository } from '../repositories/iva-recuperar.repository';

/** Migración 388 · IVA por recuperar. La base exige Finanzas o TI y valida los montos y las fechas. */
const id = z.number().int().positive();
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Poné la fecha.');
const monto = z.number().int().positive('Poné el monto en pesos chilenos.').max(99_999_999_999);
const texto = (max: number) => z.string().trim().max(max).nullable();
const RUTAS = { paths: ['/finanzas'] };

export const guardarRecuperacionIva = createAction({
  permiso: 'finanzas.gastos:editar',
  schema: z.object({
    forma: z.enum(['devolucion_exportador', 'f29', 'ajuste', 'otra']),
    fecha,
    monto,
    periodoDesde: fecha.nullable(),
    periodoHasta: fecha.nullable(),
    numeroTramite: texto(60),
    nota: texto(500),
    yaRecuperada: z.boolean(),
  }),
  handler: (d, { db }) => ivaRecuperarRepository(db).guardar(d),
  invalida: () => RUTAS,
});

export const resolverRecuperacionIva = createAction({
  permiso: 'finanzas.gastos:editar',
  schema: z.object({ id, recuperada: z.boolean(), fecha, monto: monto.nullable(), nota: texto(500) }),
  handler: (d, { db }) => ivaRecuperarRepository(db).resolver(d.id, d.recuperada, d.fecha, d.monto, d.nota),
  invalida: () => RUTAS,
});

export const anularRecuperacionIva = createAction({
  permiso: 'finanzas.gastos:transicionar',
  schema: z.object({ id, motivo: z.string().trim().min(1, 'Escribí el motivo.').max(500) }),
  handler: (d, { db }) => ivaRecuperarRepository(db).anular(d.id, d.motivo),
  invalida: () => RUTAS,
});
