'use server';

import { createAction } from '@/server/actions/create-action';
import {
  altaSchema,
  anularHitoSchema,
  avanzarSchema,
  cancelarOperacionSchema,
  eliminarSchema,
  equipoSchema,
  gensetOperacionSchema,
  hitoSchema,
  lineaSchema,
  operacionSchema,
  quitarEquipoSchema,
  servicioSchema,
  terceroSchema,
  terminarDemoraSchema,
  transportistaSchema,
} from '../domain/operacion.schemas';
import { operacionesRepository } from '../repositories/operaciones.repository';

/**
 * Server actions de Operaciones (migración 41). Matriz: operacion.servicios (editar), también para
 * los catálogos de líneas y transportistas. La base vuelve a controlar todo con el rol tc_* del usuario.
 */
const PERMISO = 'operacion.servicios:editar' as const;
const rutas = () => ({ paths: ['/operacion/operaciones', '/operacion/viajes', '/flota/pizarra'] });
const catalogos = () => ({ paths: ['/operacion/lineas', '/operacion/transportistas', '/operacion/operaciones'] });

export const guardarOperacion = createAction({
  permiso: PERMISO,
  schema: operacionSchema,
  handler: (d, { db }) => operacionesRepository(db).guardar(d),
  invalida: rutas,
});

/** Migración 42: alta en un paso (varias iguales o una con equipo) y pasos de un clic. */
export const altaOperaciones = createAction({
  permiso: PERMISO,
  schema: altaSchema,
  handler: (d, { db }) => operacionesRepository(db).alta(d),
  invalida: rutas,
});

export const avanzarOperacion = createAction({
  permiso: PERMISO,
  schema: avanzarSchema,
  handler: (d, { db }) => operacionesRepository(db).avanzar(d),
  invalida: rutas,
});

export const confirmarOperacion = createAction({
  permiso: PERMISO,
  schema: servicioSchema,
  handler: (d, { db }) => operacionesRepository(db).confirmar(d.servicioId),
  invalida: rutas,
});

export const asignarEquipo = createAction({
  permiso: PERMISO,
  schema: equipoSchema,
  handler: (d, { db }) => operacionesRepository(db).asignarEquipo(d),
  invalida: rutas,
});

export const quitarEquipo = createAction({
  permiso: PERMISO,
  schema: quitarEquipoSchema,
  handler: (d, { db }) => operacionesRepository(db).quitarEquipo(d.servicioId, d.motivo),
  invalida: rutas,
});

export const asignarTercero = createAction({
  permiso: PERMISO,
  schema: terceroSchema,
  handler: (d, { db }) => operacionesRepository(db).asignarTercero(d),
  invalida: rutas,
});

export const registrarHito = createAction({
  permiso: PERMISO,
  schema: hitoSchema,
  handler: (d, { db }) => operacionesRepository(db).registrarHito(d),
  invalida: rutas,
});

export const terminarDemora = createAction({
  permiso: PERMISO,
  schema: terminarDemoraSchema,
  handler: (d, { db }) => operacionesRepository(db).terminarDemora(d.servicioId, d.hasta),
  invalida: rutas,
});

export const anularHito = createAction({
  permiso: PERMISO,
  schema: anularHitoSchema,
  handler: (d, { db }) => operacionesRepository(db).anularHito(d.hitoId),
  invalida: rutas,
});

/** Migración 101: deshace el último paso (la base decide cuál y quién puede). */
export const volverPaso = createAction({
  permiso: PERMISO,
  schema: servicioSchema,
  handler: (d, { db }) => operacionesRepository(db).volverPaso(d.servicioId),
  invalida: rutas,
});

export const asignarGenset = createAction({
  permiso: PERMISO,
  schema: gensetOperacionSchema,
  handler: (d, { db }) => operacionesRepository(db).asignarGenset(d.servicioId, d.gensetId),
  invalida: rutas,
});

export const cancelarOperacion = createAction({
  permiso: PERMISO,
  schema: cancelarOperacionSchema,
  handler: (d, { db }) => operacionesRepository(db).cancelar(d.servicioId, d.motivo),
  invalida: rutas,
});

export const guardarLinea = createAction({
  permiso: PERMISO,
  schema: lineaSchema,
  handler: (d, { db }) => operacionesRepository(db).guardarLinea(d),
  invalida: catalogos,
});

export const eliminarLinea = createAction({
  permiso: PERMISO,
  schema: eliminarSchema,
  handler: (d, { db }) => operacionesRepository(db).eliminarLinea(d),
  invalida: catalogos,
});

export const guardarTransportista = createAction({
  permiso: PERMISO,
  schema: transportistaSchema,
  handler: (d, { db }) => operacionesRepository(db).guardarTransportista(d),
  invalida: catalogos,
});

export const eliminarTransportista = createAction({
  permiso: PERMISO,
  schema: eliminarSchema,
  handler: (d, { db }) => operacionesRepository(db).eliminarTransportista(d),
  invalida: catalogos,
});
