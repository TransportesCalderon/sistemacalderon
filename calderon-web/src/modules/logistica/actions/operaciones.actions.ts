'use server';

import { z } from 'zod';
import { createAction } from '@/server/actions/create-action';
import {
  altaSchema,
  anularHitoSchema,
  avanzarSchema,
  cancelarOperacionSchema,
  eliminarSchema,
  enBaseSchema,
  seguirSchema,
  tractorEnRutaSchema,
  fleteroSchema,
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
const rutas = () => ({ paths: ['/operacion/operaciones', '/operacion/viajes', '/flota/pizarra', '/pizarra'] });
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
  permiso: 'operacion.lineas:editar',
  schema: lineaSchema,
  handler: (d, { db }) => operacionesRepository(db).guardarLinea(d),
  invalida: catalogos,
});

export const eliminarLinea = createAction({
  permiso: 'operacion.lineas:editar',
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

/** Migración 125: cambio de tractor en la base operativa (la base exige Operaciones o TI). */
export const dejarEnBase = createAction({
  permiso: PERMISO,
  schema: enBaseSchema,
  handler: (d, { db }) => operacionesRepository(db).dejarEnBase(d),
  invalida: rutas,
});
/** Migración 176: llegó (o no) el conforme de descarga (la base exige Operaciones, Finanzas o TI). */
export const marcarConforme = createAction({
  permiso: 'operacion.servicios:ver',
  schema: z.object({ servicioId: z.number().int().positive(), llego: z.boolean() }),
  handler: (d, { db }) => operacionesRepository(db).marcarConforme(d.servicioId, d.llego),
  invalida: rutas,
});
/** Migración 174: pasa a un fletero en ruta (la base exige Operaciones o TI). */
export const pasarAFletero = createAction({
  permiso: PERMISO,
  schema: fleteroSchema,
  handler: (d, { db }) => operacionesRepository(db).pasarAFletero(d),
  invalida: rutas,
});
/** Migración 173: cambio de tractor en ruta, en un paso (la base exige Operaciones o TI). */
export const cambiarTractorEnRuta = createAction({
  permiso: PERMISO,
  schema: tractorEnRutaSchema,
  handler: (d, { db }) => operacionesRepository(db).cambiarTractorEnRuta(d),
  invalida: rutas,
});
export const seguirConOtroTractor = createAction({
  permiso: PERMISO,
  schema: seguirSchema,
  handler: (d, { db }) => operacionesRepository(db).seguirConOtroTractor(d),
  invalida: rutas,
});

/** Migración 137: alta o cambio de un agente de transporte (la base exige Operaciones o TI). */
export const guardarAgenteTransporte = createAction({
  permiso: PERMISO,
  schema: z.object({
    id: z.number().int().positive().nullable(),
    version: z.number().int().nullable(),
    nombre: z.string().trim().min(1, 'Escribí el nombre del agente.').max(120, 'Máximo 120 caracteres.'),
    activo: z.boolean(),
  }),
  handler: (d, { db }) => operacionesRepository(db).guardarAgente(d),
  invalida: catalogos,
});
