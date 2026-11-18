'use server';

import { z } from 'zod';
import { createAction } from '@/server/actions/create-action';
import { remitosRepository } from '../repositories/remitos.repository';

/** Migración 277 · Resolver los remitos de las estaciones que llegaron por mail (la base controla quién puede). */
const id = z.number().int().positive();

export const registrarRemito = createAction({
  permiso: 'combustible.cargas:editar',
  schema: z.object({ id, estacionId: id.nullable() }),
  handler: (d, { db }) => remitosRepository(db).registrar(d.id, d.estacionId),
});

export const corregirConRemito = createAction({
  permiso: 'combustible.cargas:editar',
  schema: z.object({ id }),
  handler: (d, { db }) => remitosRepository(db).corregir(d.id),
});

export const descartarRemito = createAction({
  permiso: 'combustible.cargas:editar',
  schema: z.object({ id, motivo: z.string().trim().min(5).max(300) }),
  handler: (d, { db }) => remitosRepository(db).descartar(d.id, d.motivo),
});
