'use server';

import { z } from 'zod';
import { createAction } from '@/server/actions/create-action';
import { porCerrarRepository } from '../repositories/por-cerrar.repository';

/** Cierres por hacer (migración 63). La base vuelve a controlar cada viaje y cada permiso. */
const rutas = () => ({ paths: ['/operacion/por-cerrar', '/operacion/tractores', '/operacion/viajes-chofer', '/combustible/cierres', '/pendientes'] });

export const aprobarVariosCierres = createAction({
  permiso: 'combustible.cierre_viaje:transicionar',
  schema: z.object({ viajes: z.array(z.number().int().positive()).min(1, 'Marcá al menos un viaje.').max(200) }),
  handler: (d, { db }) => porCerrarRepository(db).aprobarVarios(d.viajes),
  invalida: rutas,
});

export const completarOperacionesViaje = createAction({
  permiso: 'operacion.tramos:editar',
  schema: z.object({ viajeId: z.number().int().positive() }),
  handler: (d, { db }) => porCerrarRepository(db).completarOperaciones(d.viajeId),
  invalida: rutas,
});
