'use server';

import { z } from 'zod';
import { createAction } from '@/server/actions/create-action';
import { comiteRepository } from '../repositories/comite.repository';

/** Migración 179 · Comité mensual de consumo. Quién revisa y quién cierra lo decide la base. */
const mes = z.string().regex(/^\d{4}-\d{2}-01$/, 'Elegí el mes');

export const revisarEquipoMes = createAction({
  permiso: 'combustible.consumo:ver',
  schema: z.object({
    mes,
    tipo: z.enum(['tractor', 'genset']),
    equipoId: z.number().int().positive(),
    revisado: z.boolean(),
    comentario: z.string().nullable(),
    accion: z.string().nullable(),
  }),
  handler: (d, { db }) => comiteRepository(db).revisar(d),
});

export const cerrarComite = createAction({
  permiso: 'combustible.consumo:ver',
  schema: z.object({ mes, participantes: z.string(), conclusiones: z.string().nullable() }),
  handler: (d, { db }) => comiteRepository(db).cerrar(d),
});
