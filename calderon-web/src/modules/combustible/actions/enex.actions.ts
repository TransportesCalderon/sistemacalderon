'use server';

import { z } from 'zod';
import { createAction } from '@/server/actions/create-action';
import { enexRepository } from '../repositories/enex.repository';

/** Shell 02 · Resolver las cargas de Shell Card que informó Enex (la base controla quién puede). */
const id = z.number().int().positive();

export const registrarCargaEnex = createAction({
  permiso: 'combustible.cargas:editar',
  schema: z.object({ id, estacionId: id.nullable() }),
  handler: (d, { db }) => enexRepository(db).registrar(d.id, d.estacionId),
});

export const corregirCargaEnex = createAction({
  permiso: 'combustible.cargas:editar',
  schema: z.object({ id }),
  handler: (d, { db }) => enexRepository(db).corregir(d.id),
});

export const descartarCargaEnex = createAction({
  permiso: 'combustible.cargas:editar',
  schema: z.object({ id, motivo: z.string().trim().min(5).max(300) }),
  handler: (d, { db }) => enexRepository(db).descartar(d.id, d.motivo),
});
