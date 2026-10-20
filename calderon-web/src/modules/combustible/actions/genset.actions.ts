'use server';

import { createAction } from '@/server/actions/create-action';
import { anularCierreGensetSchema, cerrarGensetSchema, eliminarRegistroGensetSchema, registroGensetSchema } from '../domain/genset.schemas';
import { gensetRepository } from '../repositories/genset.repository';

/**
 * Combustible de los gensets (migración 48):
 *  - combustible.cargas:editar → registrar una carga o una descarga, y eliminarla;
 *  - combustible.cierre_viaje:transicionar → cerrar y anular (la base además exige Administración de combustible o TI).
 */
const rutas = (gensetId: number) => ({ paths: ['/flota/gensets', `/flota/gensets/${gensetId}`, '/combustible/base'] });

export const registrarGenset = createAction({
  permiso: 'combustible.cargas:editar',
  schema: registroGensetSchema,
  handler: (d, { db }) => gensetRepository(db).registrar(d),
  invalida: (d) => rutas(d.gensetId),
});

export const eliminarRegistroGenset = createAction({
  permiso: 'combustible.cargas:editar',
  schema: eliminarRegistroGensetSchema,
  handler: (d, { db }) => gensetRepository(db).eliminar(d.registroId, d.motivo),
  invalida: (d) => rutas(d.gensetId),
});

export const cerrarGenset = createAction({
  permiso: 'combustible.cierre_viaje:transicionar',
  schema: cerrarGensetSchema,
  handler: (d, { db }) => gensetRepository(db).cerrar(d.inicioId, d.choferId, d.motivoChofer, d.okTolerancia, d.observacion),
  invalida: (d) => rutas(d.gensetId),
});

export const anularCierreGenset = createAction({
  permiso: 'combustible.cierre_viaje:transicionar',
  schema: anularCierreGensetSchema,
  handler: (d, { db }) => gensetRepository(db).anular(d.cierreId, d.motivo),
  invalida: (d) => rutas(d.gensetId),
});
