'use server';

import { createAction } from '@/server/actions/create-action';
import { anularCierreRalentiSchema, cerrarRalentiSchema } from '../domain/ralenti.schemas';
import { ralentiRepository } from '../repositories/ralenti.repository';

/** Ralentí del mes (migración 50): cerrar y anular. La base además exige Administración de combustible o TI. */
const rutas = () => ({ paths: ['/combustible/ralenti', '/pendientes'] });

export const cerrarRalenti = createAction({
  permiso: 'combustible.cierre_viaje:transicionar',
  schema: cerrarRalentiSchema,
  handler: (d, { db }) => ralentiRepository(db).cerrar(d),
  invalida: rutas,
});

export const anularCierreRalenti = createAction({
  permiso: 'combustible.cierre_viaje:transicionar',
  schema: anularCierreRalentiSchema,
  handler: (d, { db }) => ralentiRepository(db).anular(d.cierreId, d.motivo),
  invalida: rutas,
});
