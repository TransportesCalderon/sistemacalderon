'use server';

import { createAction } from '@/server/actions/create-action';
import { anularHabilitacionSchema, habilitarHorarioSchema, labrarActaHorarioSchema, sinSancionHorarioSchema } from '../domain/horario.types';
import { horarioRepository } from '../repositories/horario.repository';

/** Migración 286: habilitar a un tractor a circular fuera de horario esta noche. Solo quien tiene la marca (lo controla la base). */
export const habilitarFueraHorario = createAction({
  permiso: 'telemetria.mapa:ver',
  schema: habilitarHorarioSchema,
  handler: (d, { db }) => horarioRepository(db).habilitar(d.camionId, d.motivo),
});

/** Migración 389: labrar el acta de una noche con infracción (la base exige quien hace actas). */
export const labrarActaFueraHorario = createAction({
  permiso: 'operacion.actas:editar',
  schema: labrarActaHorarioSchema,
  handler: (d, { db }) => horarioRepository(db).labrarActa(d.id, d.descripcion, d.lugar),
  invalida: () => ({ paths: ['/actas'] }),
});

/** Migración 389: dejar la infracción sin sanción, con motivo (la base exige Gerencia, jefe de Operaciones o TI). */
export const sinSancionFueraHorario = createAction({
  permiso: 'telemetria.mapa:ver',
  schema: sinSancionHorarioSchema,
  handler: (d, { db }) => horarioRepository(db).sinSancion(d.id, d.motivo),
});

/** Migración 286: anular esa habilitación. */
export const anularHabilitacionHorario = createAction({
  permiso: 'telemetria.mapa:ver',
  schema: anularHabilitacionSchema,
  handler: (d, { db }) => horarioRepository(db).anular(d.id, d.motivo),
});
