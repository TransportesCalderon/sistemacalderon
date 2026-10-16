'use server';

import { createAction } from '@/server/actions/create-action';
import {
  anularSegmentoSchema,
  aprobarSegmentoSchema,
  controlBaseSchema,
  movimientoBaseSchema,
  resolverMovimientoBaseSchema,
  responsableSchema,
  tanqueBaseSchema,
  traspasoSchema,
} from '../domain/base.schemas';
import { baseRepository } from '../repositories/base.repository';

/**
 * Server actions de Base Mendoza (fila combustible.depositos de la matriz):
 *  - editar: registrar controles, compras y otros movimientos con motivo, responsable y traspaso;
 *  - transicionar: aprobar o rechazar movimientos con motivo, aprobar y anular segmentos.
 * El alta y la edición del tanque son de configuración (solo TI; la base solo deja a tc_admin).
 * Quién puede aprobar (otro usuario, rol aprobador, no el responsable) lo decide la base.
 */
const rutas = () => ({ paths: ['/combustible/base', '/combustible/movimientos'] });

export const guardarTanqueBase = createAction({
  permiso: 'configuracion.catalogos:editar',
  schema: tanqueBaseSchema,
  handler: (d, { db }) => baseRepository(db).guardarTanque(d),
  invalida: rutas,
});

export const registrarControlBase = createAction({
  permiso: 'combustible.depositos:editar',
  schema: controlBaseSchema,
  handler: (d, { db }) => baseRepository(db).registrarControl(d),
  invalida: rutas,
});

export const registrarMovimientoBase = createAction({
  permiso: 'combustible.depositos:editar',
  schema: movimientoBaseSchema,
  handler: (d, { db }) => baseRepository(db).movimientoConMotivo(d),
  invalida: rutas,
});

export const resolverMovimientoBase = createAction({
  permiso: 'combustible.depositos:transicionar',
  schema: resolverMovimientoBaseSchema,
  handler: ({ movimientoId, aprobar, motivo }, { db }) => baseRepository(db).resolverMovimiento(movimientoId, aprobar, motivo),
  invalida: rutas,
});

export const asignarResponsableBase = createAction({
  permiso: 'combustible.depositos:editar',
  schema: responsableSchema,
  handler: ({ depositoId, usuarioId, desde }, { db }) => baseRepository(db).asignarResponsable(depositoId, usuarioId, desde),
  invalida: rutas,
});

export const traspasarResponsableBase = createAction({
  permiso: 'combustible.depositos:editar',
  schema: traspasoSchema,
  handler: (d, { db }) => baseRepository(db).traspasar(d),
  invalida: rutas,
});

export const aprobarSegmentoBase = createAction({
  permiso: 'combustible.depositos:transicionar',
  schema: aprobarSegmentoSchema,
  handler: (d, { db }) => baseRepository(db).aprobarSegmento(d),
  invalida: rutas,
});

export const anularSegmentoBase = createAction({
  permiso: 'combustible.depositos:transicionar',
  schema: anularSegmentoSchema,
  handler: ({ aprobacionId, motivo }, { db }) => baseRepository(db).anularSegmento(aprobacionId, motivo),
  invalida: rutas,
});
