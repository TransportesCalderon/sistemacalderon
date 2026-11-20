'use server';

import { createAction } from '@/server/actions/create-action';
import { anularHabilitacionSchema, habilitarHorarioSchema } from '../domain/horario.types';
import { horarioRepository } from '../repositories/horario.repository';

/** Migración 286: habilitar a un tractor a circular fuera de horario esta noche. Solo quien tiene la marca (lo controla la base). */
export const habilitarFueraHorario = createAction({
  permiso: 'telemetria.mapa:ver',
  schema: habilitarHorarioSchema,
  handler: (d, { db }) => horarioRepository(db).habilitar(d.camionId, d.motivo),
});

/** Migración 286: anular esa habilitación. */
export const anularHabilitacionHorario = createAction({
  permiso: 'telemetria.mapa:ver',
  schema: anularHabilitacionSchema,
  handler: (d, { db }) => horarioRepository(db).anular(d.id, d.motivo),
});
