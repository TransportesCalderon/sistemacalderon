'use server';

import { createAction } from '@/server/actions/create-action';
import { camionAltaSchema, camionEdicionSchema } from '../domain/camion.schemas';
import { camionService } from '../services/camion.service';

/**
 * Server actions de Flota > Camiones. Permiso de la matriz §16: 'flota.camiones:editar'
 * (Operaciones y TI). La base vuelve a controlar con el rol tc_* del usuario.
 */
export const crearCamion = createAction({
  permiso: 'flota.camiones:editar',
  schema: camionAltaSchema,
  handler: (datos, { db }) => camionService(db).crear(datos),
  invalida: (_datos, camion) => ({ paths: ['/flota/camiones', `/flota/camiones/${camion.id}`] }),
});

export const editarCamion = createAction({
  permiso: 'flota.camiones:editar',
  schema: camionEdicionSchema,
  handler: (input, { db }) => camionService(db).editar(input),
  invalida: ({ id }) => ({ paths: ['/flota/camiones', `/flota/camiones/${id}`] }),
});
