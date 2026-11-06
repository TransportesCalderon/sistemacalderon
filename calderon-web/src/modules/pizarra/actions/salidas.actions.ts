'use server';

import { z } from 'zod';
import { createAction } from '@/server/actions/create-action';
import { salidasRepository } from '../repositories/salidas.repository';

/** Migración 196: libro de salidas. Lo completan Operaciones, Base Mendoza y TI (lo controla la base). */
const id = z.number().int().positive();
const opcional = id.nullable();
const texto = z.string().max(300).nullable();

export const guardarSalida = createAction({
  permiso: 'flota.pizarra:editar',
  schema: z.object({
    id: opcional,
    camionId: z.number({ message: 'Elegí el tractor.' }).int().positive({ message: 'Elegí el tractor.' }),
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Indicá el día.'),
    hora: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
    choferId: opcional,
    semiId: opcional,
    gensetId: opcional,
    producto: texto,
    destino: texto,
    observacion: texto,
    devolucion: texto,
  }),
  handler: (d, { db }) => salidasRepository(db).guardar(d),
});

export const descartarSalida = createAction({
  permiso: 'flota.pizarra:editar',
  schema: z.object({ id, motivo: z.string().max(300) }),
  handler: (d, { db }) => salidasRepository(db).descartar(d.id, d.motivo),
});
