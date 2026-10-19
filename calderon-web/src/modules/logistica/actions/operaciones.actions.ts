'use server';

import { createAction } from '@/server/actions/create-action';
import {
  anularHitoSchema,
  cancelarOperacionSchema,
  eliminarSchema,
  equipoSchema,
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
