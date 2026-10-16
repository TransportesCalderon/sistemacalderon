'use server';

import { createAction } from '@/server/actions/create-action';
import {
  bajaTanqueSchema,
  cambioCapacidadSchema,
  descripcionTanqueSchema,
  eliminarTanqueSchema,
  tanqueAltaSchema,
  tanquesAltaSchema,
} from '../domain/tanque.schemas';
import { tanqueRepository } from '../repositories/tanque.repository';

/**
 * Server actions de los tanques del camión (ficha del camión, sección Tanques).
 * Mismo permiso que editar el camión; la base vuelve a controlar con el rol tc_* del usuario.
 */
const ficha = ({ camionId }: { camionId: number }) => ({
  paths: [`/flota/camiones/${camionId}`],
});

export const crearTanque = createAction({
  permiso: 'flota.camiones:editar',
  schema: tanqueAltaSchema,
  handler: (d, { db }) => tanqueRepository(db).crear(d),
  invalida: ficha,
});

export const cambiarCapacidadTanque = createAction({
  permiso: 'flota.camiones:editar',
  schema: cambioCapacidadSchema,
  handler: (d, { db }) => tanqueRepository(db).cambiarCapacidad(d),
  invalida: ficha,
});

export const darDeBajaTanque = createAction({
  permiso: 'flota.camiones:editar',
  schema: bajaTanqueSchema,
  handler: (d, { db }) => tanqueRepository(db).darDeBaja(d),
  invalida: ficha,
});

export const eliminarTanque = createAction({
  permiso: 'flota.camiones:editar',
  schema: eliminarTanqueSchema,
  handler: (d, { db }) => tanqueRepository(db).eliminar(d),
  invalida: ficha,
});

export const editarDescripcionTanque = createAction({
  permiso: 'flota.camiones:editar',
  schema: descripcionTanqueSchema,
  handler: (d, { db }) => tanqueRepository(db).editarDescripcion(d),
  invalida: ficha,
});

/** Alta del camión: sus tanques juntos (todos o ninguno). */
export const crearTanques = createAction({
  permiso: 'flota.camiones:editar',
  schema: tanquesAltaSchema,
  handler: (d, { db }) => tanqueRepository(db).crearVarios(d),
  invalida: ficha,
});
