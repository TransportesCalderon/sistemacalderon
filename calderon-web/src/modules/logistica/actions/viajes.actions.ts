'use server';

import { createAction } from '@/server/actions/create-action';
import {
  asignarViajeSchema,
  cambiarChoferSchema,
  cancelarSchema,
  modificarViajeSchema,
  pasoSchema,
  reprogramarSchema,
  vueltaVaciaSchema,
} from '../domain/viaje.schemas';
import { viajesRepository } from '../repositories/viajes.repository';

/**
 * Server actions de Logística (migración 40). Matriz: operacion.tramos.
 *  - editar: asignar, modificar, reprogramar, cambiar chofer y cancelar.
 *  - transicionar: los pasos del viaje (salir, cargar, descargar, terminar).
 * La base vuelve a controlar todo con el rol tc_* del usuario.
 */
const rutas = () => ({ paths: ['/operacion/viajes', '/flota/pizarra', '/pizarra'] });

export const asignarViaje = createAction({
  permiso: 'operacion.tramos:editar',
  schema: asignarViajeSchema,
  handler: (d, { db }) => viajesRepository(db).asignar(d),
  invalida: rutas,
});

export const asignarVueltaVacia = createAction({
  permiso: 'operacion.tramos:editar',
  schema: vueltaVaciaSchema,
  handler: (d, { db }) => viajesRepository(db).vueltaVacia(d),
  invalida: rutas,
});

export const modificarViaje = createAction({
  permiso: 'operacion.tramos:editar',
  schema: modificarViajeSchema,
  handler: (d, { db }) => viajesRepository(db).modificar(d),
  invalida: rutas,
});

export const reprogramarDescarga = createAction({
  permiso: 'operacion.tramos:editar',
  schema: reprogramarSchema,
  handler: (d, { db }) => viajesRepository(db).reprogramar(d.tramoId, d.fechaDescarga),
  invalida: rutas,
});

export const cambiarChofer = createAction({
  permiso: 'operacion.tramos:editar',
  schema: cambiarChoferSchema,
  handler: (d, { db }) => viajesRepository(db).cambiarChofer(d.tramoId, d.choferId, d.desde),
  invalida: rutas,
});

export const cancelarViaje = createAction({
  permiso: 'operacion.tramos:editar',
  schema: cancelarSchema,
  handler: (d, { db }) => viajesRepository(db).cancelar(d.tramoId, d.motivo),
  invalida: rutas,
});

export const pasoViaje = createAction({
  permiso: 'operacion.tramos:transicionar',
  schema: pasoSchema,
  handler: (d, { db }) => viajesRepository(db).paso(d),
  invalida: rutas,
});
