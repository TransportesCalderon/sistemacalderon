'use server';

import { z } from 'zod';
import { createAction } from '@/server/actions/create-action';
import { seguimientoRepository } from '../repositories/seguimiento.repository';

/** Migración 194: registrar el control de un viaje en curso. Lo puede hacer Telemetría o TI (lo controla la base). */
export const registrarSeguimiento = createAction({
  permiso: 'telemetria.mapa:ver',
  schema: z.object({
    viajeId: z.number().int().positive(),
    km: z.number().positive().nullable(),
    litros: z.number().positive().nullable(),
    programador: z.number().min(0).max(100).nullable(),
  }),
  handler: (d, { db }) => seguimientoRepository(db).registrar(d.viajeId, d.km, d.litros, d.programador),
});
