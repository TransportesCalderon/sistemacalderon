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
const rutas = () => ({ paths: ['/pizarra', '/operacion/viajes-chofer'] });

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
  // 05/11/2026: también quien hace el cierre (Telemetría / Combustible) carga las operaciones del viaje
  permiso: ['operacion.tramos:editar', 'combustible.cierre_viaje:editar'],
  schema: agregarItemSchema,
  handler: (d, { db }) => viajesChoferRepository(db).agregarItem(d.viajeId, d.servicioId, d.lineaId),
  invalida: rutas,
});

export const ajustarItemViaje = createAction({
  // 05/11/2026: también quien hace el cierre (Telemetría / Combustible) carga las operaciones del viaje
  permiso: ['operacion.tramos:editar', 'combustible.cierre_viaje:editar'],
  schema: ajustarItemSchema,
  handler: (d, { db }) => viajesChoferRepository(db).ajustarItem(d),
  invalida: rutas,
});

/** Migración 109: «Continúa a …»: el tramo que sigue de la misma operación. */
export const continuarOperacionViaje = createAction({
  // 05/11/2026: también quien hace el cierre (Telemetría / Combustible) carga las operaciones del viaje
  permiso: ['operacion.tramos:editar', 'combustible.cierre_viaje:editar'],
  schema: itemIdSchema,
  handler: (d, { db }) => viajesChoferRepository(db).continuarOperacion(d.itemId),
  invalida: rutas,
});

export const quitarItemViaje = createAction({
  // 05/11/2026: también quien hace el cierre (Telemetría / Combustible) carga las operaciones del viaje
  permiso: ['operacion.tramos:editar', 'combustible.cierre_viaje:editar'],
  schema: itemIdSchema,
  handler: (d, { db }) => viajesChoferRepository(db).quitarItem(d.itemId),
  invalida: rutas,
});

export const cambiarChoferViaje = createAction({
  // 09/11/2026: también Telemetría (asigna los choferes a los tractores) y Combustible (hace el cierre)
  permiso: ['operacion.tramos:editar', 'combustible.cierre_viaje:editar', 'flota.asignaciones:editar'],
  schema: cambiarChoferViajeSchema,
  handler: (d, { db }) => viajesChoferRepository(db).cambiarChofer(d.viajeId, d.choferId),
  invalida: rutas,
});

export const prepararCierreCombustible = createAction({
  permiso: ['operacion.tramos:editar', 'combustible.cierre_viaje:editar'],
  schema: viajeIdSchema,
  handler: (d, { db }) => viajesChoferRepository(db).prepararCierre(d.viajeId),
  invalida: () => ({ paths: ['/operacion/viajes-chofer', '/combustible/viajes', '/combustible/cierres'] }),
});

export const cerrarViajeChofer = createAction({
  permiso: 'operacion.tramos:transicionar',
  schema: cerrarViajeSchema,
  handler: (d, { db }) => viajesChoferRepository(db).cerrar(d.viajeId, d.versionFila),
  invalida: () => ({ paths: ['/pizarra', '/operacion/viajes-chofer', '/combustible/viajes', '/combustible/cierres'] }),
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
  // Migración 170: quién aprueba lo decide la base (autorizados por TI, nunca quien lo preparó)
  permiso: 'combustible.cierre_viaje:ver',
  schema: cerrarViajeSchema,
  handler: (d, { db }) => viajesChoferRepository(db).cerrarYAprobar(d.viajeId, d.versionFila),
  invalida: () => ({ paths: ['/pizarra', '/operacion/viajes-chofer', '/combustible/viajes', '/combustible/cierres', '/pendientes'] }),
});
