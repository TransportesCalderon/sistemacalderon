'use server';

import { createAction } from '@/server/actions/create-action';
import {
  agregarItemSchema,
  ajustarItemSchema,
  asignarTractorSchema,
  cambiarChoferViajeSchema,
  cerrarViajeSchema,
  iniciarViajeSchema,
  itemIdSchema,
  viajeConMotivoSchema,
  viajeIdSchema,
} from '../domain/viaje-chofer.schemas';
import { viajesChoferRepository } from '../repositories/viajes-chofer.repository';

/**
 * Tractores y viajes de chofer (migración 46).
 *  - flota.asignaciones:editar → chofer fijo de cada tractor.
 *  - operacion.tramos:editar → iniciar el viaje y cargar lo que llevó.
 *  - operacion.tramos:transicionar → cerrar, reabrir y anular.
 */
const rutas = () => ({ paths: ['/operacion/tractores', '/operacion/viajes-chofer'] });

export const asignarTractor = createAction({
  permiso: 'flota.asignaciones:editar',
  schema: asignarTractorSchema,
  handler: (d, { db }) => viajesChoferRepository(db).asignarTractor(d),
  invalida: rutas,
});

export const iniciarViajeChofer = createAction({
  permiso: 'operacion.tramos:editar',
  schema: iniciarViajeSchema,
  handler: (d, { db }) => viajesChoferRepository(db).iniciar(d),
  invalida: rutas,
});

export const agregarItemViaje = createAction({
  permiso: 'operacion.tramos:editar',
  schema: agregarItemSchema,
  handler: (d, { db }) => viajesChoferRepository(db).agregarItem(d.viajeId, d.servicioId, d.lineaId),
  invalida: rutas,
});

export const ajustarItemViaje = createAction({
  permiso: 'operacion.tramos:editar',
  schema: ajustarItemSchema,
  handler: (d, { db }) => viajesChoferRepository(db).ajustarItem(d),
  invalida: rutas,
});

export const quitarItemViaje = createAction({
  permiso: 'operacion.tramos:editar',
  schema: itemIdSchema,
  handler: (d, { db }) => viajesChoferRepository(db).quitarItem(d.itemId),
  invalida: rutas,
});

export const cambiarChoferViaje = createAction({
  permiso: 'operacion.tramos:editar',
  schema: cambiarChoferViajeSchema,
  handler: (d, { db }) => viajesChoferRepository(db).cambiarChofer(d.viajeId, d.choferId),
  invalida: rutas,
});

export const prepararCierreCombustible = createAction({
  permiso: 'operacion.tramos:editar',
  schema: viajeIdSchema,
  handler: (d, { db }) => viajesChoferRepository(db).prepararCierre(d.viajeId),
  invalida: () => ({ paths: ['/operacion/viajes-chofer', '/combustible/viajes', '/combustible/cierres'] }),
});

export const cerrarViajeChofer = createAction({
  permiso: 'operacion.tramos:transicionar',
  schema: cerrarViajeSchema,
  handler: (d, { db }) => viajesChoferRepository(db).cerrar(d.viajeId, d.versionFila),
  invalida: () => ({ paths: ['/operacion/tractores', '/operacion/viajes-chofer', '/combustible/viajes', '/combustible/cierres'] }),
});

export const reabrirViajeChofer = createAction({
  permiso: 'operacion.tramos:transicionar',
  schema: viajeConMotivoSchema,
  handler: (d, { db }) => viajesChoferRepository(db).reabrir(d.viajeId, d.motivo),
  invalida: rutas,
});

export const anularViajeChofer = createAction({
  permiso: 'operacion.tramos:transicionar',
  schema: viajeConMotivoSchema,
  handler: (d, { db }) => viajesChoferRepository(db).anular(d.viajeId, d.motivo),
  invalida: rutas,
});

/** Migración 55: el mismo usuario cierra el viaje y aprueba su cierre de combustible, todo junto. */
export const cerrarYAprobarViaje = createAction({
  permiso: 'combustible.cierre_viaje:transicionar',
  schema: cerrarViajeSchema,
  handler: (d, { db }) => viajesChoferRepository(db).cerrarYAprobar(d.viajeId, d.versionFila),
  invalida: () => ({ paths: ['/operacion/tractores', '/operacion/viajes-chofer', '/combustible/viajes', '/combustible/cierres', '/pendientes'] }),
});
