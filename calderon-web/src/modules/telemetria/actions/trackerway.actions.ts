'use server';

import { z } from 'zod';
import { createAction } from '@/server/actions/create-action';
import { trackerwayRepository } from '../repositories/trackerway.repository';

/** Equipos GPS de Trackerway (migración 72). La base exige que sea TI. */
const RUTA = { paths: ['/telemetria/equipos'] };

export const buscarEquiposTrackerway = createAction({
  permiso: 'telemetria.calidad:editar',
  schema: z.object({}),
  handler: (_d, { db }) => trackerwayRepository(db).buscar(),
  invalida: () => RUTA,
});

export const enlazarEquipoTrackerway = createAction({
  permiso: 'telemetria.calidad:editar',
  schema: z.object({ imei: z.string().min(1), camionId: z.number().int().positive().nullable() }),
  handler: (d, { db }) => trackerwayRepository(db).enlazar(d.imei, d.camionId),
  invalida: () => RUTA,
});

export const importarEquipoTrackerway = createAction({
  permiso: 'telemetria.calidad:editar',
  schema: z.object({ imei: z.string().min(1), importar: z.boolean() }),
  handler: (d, { db }) => trackerwayRepository(db).importar(d.imei, d.importar),
  invalida: () => RUTA,
});
