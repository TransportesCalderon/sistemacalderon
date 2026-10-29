'use server';

import { createAction } from '@/server/actions/create-action';
import { anularActaSchema, cambiarActaSchema, crearActaSchema, firmarActaSchema, fotoActaSchema, quitarFotoSchema } from '../domain/acta.types';
import { actaRepository } from '../repositories/acta.repository';

/**
 * Migración 122 · Actas de infracción:
 *  - operacion.actas:editar → hacer, cambiar, fotos y firmada (la base exige Gerencia, Operaciones, Control o TI;
 *    el monto y el descuento, Gerencia, Operaciones o TI);
 *  - operacion.actas:transicionar → anular (la base exige Gerencia, Operaciones o TI).
 */
const rutas = () => ({ paths: ['/actas'] });

export const crearActa = createAction({
  permiso: 'operacion.actas:editar',
  schema: crearActaSchema,
  handler: (d, { db }) => actaRepository(db).crear(d),
  invalida: rutas,
});

export const cambiarActa = createAction({
  permiso: 'operacion.actas:editar',
  schema: cambiarActaSchema,
  handler: (d, { db }) => actaRepository(db).cambiar(d),
  invalida: rutas,
});

export const agregarFotoActa = createAction({
  permiso: 'operacion.actas:editar',
  schema: fotoActaSchema,
  handler: (d, { db }) => actaRepository(db).agregarFoto(d.actaId, d.ruta, d.nombre),
  invalida: rutas,
});

export const quitarFotoActa = createAction({
  permiso: 'operacion.actas:editar',
  schema: quitarFotoSchema,
  handler: (d, { db }) => actaRepository(db).quitarFoto(d.fotoId),
  invalida: rutas,
});

export const firmarActa = createAction({
  permiso: 'operacion.actas:editar',
  schema: firmarActaSchema,
  handler: (d, { db }) => actaRepository(db).firmar(d.id, d.ruta, d.descargo, d.seNego),
  invalida: rutas,
});

export const anularActa = createAction({
  permiso: 'operacion.actas:transicionar',
  schema: anularActaSchema,
  handler: (d, { db }) => actaRepository(db).anular(d.id, d.motivo),
  invalida: rutas,
});
