'use server';

import { createAction } from '@/server/actions/create-action';
import {
  edicionPizarraSchema,
  eliminarSchema,
  gensetSchema,
  instalarGensetSchema,
  retirarGensetSchema,
  semiSchema,
  tipoAccesorioSchema,
} from '../domain/pizarra.schemas';
import { pizarraRepository } from '../repositories/pizarra.repository';

/**
 * Server actions de la Pizarra Azul y sus catálogos (migración 39). Permisos de la matriz:
 *  - Lugar en playa, observación, accesorios, tipos de accesorio y gensets: flota.pizarra.
 *  - Semirremolques: flota.camiones (la misma fila que camiones en la especificación).
 * La base vuelve a controlar con el rol tc_* del usuario.
 */
const rutas = () => ({ paths: ['/flota/pizarra', '/flota/semirremolques', '/flota/gensets', '/flota/accesorios'] });

export const guardarEdicionPizarra = createAction({
  permiso: 'flota.pizarra:editar',
  schema: edicionPizarraSchema,
  handler: (d, { db }) => pizarraRepository(db).guardarEdicion(d),
});

export const guardarSemi = createAction({
  permiso: 'flota.camiones:editar',
  schema: semiSchema,
  handler: (d, { db }) => pizarraRepository(db).guardarSemi(d),
  invalida: rutas,
});

export const bajaSemi = createAction({
  permiso: 'flota.camiones:editar',
  schema: eliminarSchema,
  handler: (d, { db }) => pizarraRepository(db).bajaSemi(d),
  invalida: rutas,
});

export const guardarTipoAccesorio = createAction({
  permiso: 'flota.pizarra:editar',
  schema: tipoAccesorioSchema,
  handler: (d, { db }) => pizarraRepository(db).guardarTipoAccesorio(d),
  invalida: rutas,
});

export const eliminarTipoAccesorio = createAction({
  permiso: 'flota.pizarra:editar',
  schema: eliminarSchema,
  handler: (d, { db }) => pizarraRepository(db).eliminarTipoAccesorio(d),
  invalida: rutas,
});

export const guardarGenset = createAction({
  permiso: 'flota.pizarra:editar',
  schema: gensetSchema,
  handler: (d, { db }) => pizarraRepository(db).guardarGenset(d),
  invalida: rutas,
});

export const eliminarGenset = createAction({
  permiso: 'flota.pizarra:editar',
  schema: eliminarSchema,
  handler: (d, { db }) => pizarraRepository(db).eliminarGenset(d),
  invalida: rutas,
});

export const instalarGenset = createAction({
  permiso: 'flota.pizarra:editar',
  schema: instalarGensetSchema,
  handler: (d, { db }) => pizarraRepository(db).instalarGenset(d),
  invalida: rutas,
});

export const retirarGenset = createAction({
  permiso: 'flota.pizarra:editar',
  schema: retirarGensetSchema,
  handler: (d, { db }) => pizarraRepository(db).retirarGenset(d.semiId),
  invalida: rutas,
});
