'use server';

import { createAction } from '@/server/actions/create-action';
import { agregarGastoSchema, anularGastoSchema } from '../domain/costos.schemas';
import { costosRepository } from '../repositories/costos.repository';

/** Gastos a mano del viaje (migración 51). La base además exige Operaciones, Adm. de combustible, Finanzas o TI. */
const rutas = (viajeId: number) => ({ paths: [`/operacion/viajes-chofer/${viajeId}`, '/operacion/costos'] });

export const agregarGastoViaje = createAction({
  permiso: 'finanzas.costos_directos:editar',
  schema: agregarGastoSchema,
  handler: (d, { db }) => costosRepository(db).agregarGasto(d),
  invalida: (d) => rutas(d.viajeId),
});

export const anularGastoViaje = createAction({
  permiso: 'finanzas.costos_directos:editar',
  schema: anularGastoSchema,
  handler: (d, { db }) => costosRepository(db).anularGasto(d.gastoId, d.motivo),
  invalida: (d) => rutas(d.viajeId),
});
