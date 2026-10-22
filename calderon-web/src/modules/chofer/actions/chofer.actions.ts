'use server';

import { createAction } from '@/server/actions/create-action';
import {
  anularMovimientoSchema,
  cerrarFondoSchema,
  entregaSchema,
  gastoOficinaSchema,
  posicionSchema,
  quitarDocumentoSchema,
  reabrirFondoSchema,
  retirarGastoSchema,
  revisarGastoSchema,
  subirDocumentoSchema,
  subirGastoSchema,
} from '../domain/chofer.schemas';
import { choferRepository } from '../repositories/chofer.repository';

/**
 * Escrituras del módulo del chofer (migraciones 60 y 61). El permiso de la pantalla es el
 * primer filtro; la base vuelve a decidir (el chofer, solo lo suyo; los fondos, RRHH,
 * Finanzas o TI).
 */
const rutasChofer = () => ({ paths: ['/chofer', '/chofer/gastos'] });
const rutasFondos = () => ({ paths: ['/rrhh/fondos', '/rrhh/liquidacion', '/chofer/gastos'] });

/* Documentos: el chofer desde Mi carga; Logística desde la operación. */
export const subirDocumentoChofer = createAction({
  permiso: 'chofer.mi_carga:editar',
  schema: subirDocumentoSchema,
  handler: (d, { db }) => choferRepository(db).subirDocumento(d),
  invalida: rutasChofer,
});
export const quitarDocumentoChofer = createAction({
  permiso: 'chofer.mi_carga:editar',
  schema: quitarDocumentoSchema,
  handler: (d, { db }) => choferRepository(db).quitarDocumento(d.documentoId),
  invalida: rutasChofer,
});
export const subirDocumentoOficina = createAction({
  permiso: 'operacion.servicios:editar',
  schema: subirDocumentoSchema,
  handler: (d, { db }) => choferRepository(db).subirDocumento(d),
});
export const quitarDocumentoOficina = createAction({
  permiso: 'operacion.servicios:editar',
  schema: quitarDocumentoSchema,
  handler: (d, { db }) => choferRepository(db).quitarDocumento(d.documentoId),
});

/* Ubicación del celular (solo se guarda si tiene una carga asignada: lo decide la base). */
export const enviarPosicion = createAction({
  permiso: 'chofer.mi_carga:editar',
  schema: posicionSchema,
  handler: (d, { db }) => choferRepository(db).registrarPosicion(d),
});

/* Mis gastos */
export const subirGasto = createAction({
  permiso: 'chofer.mis_gastos:editar',
  schema: subirGastoSchema,
  handler: (d, { db }) => choferRepository(db).subirGasto(d),
  invalida: rutasChofer,
});
export const retirarGasto = createAction({
  permiso: 'chofer.mis_gastos:editar',
  schema: retirarGastoSchema,
  handler: (d, { db }) => choferRepository(db).retirarGasto(d.gastoId),
  invalida: rutasChofer,
});

/* Administración: fondos y gastos */
export const registrarEntregaFondo = createAction({
  permiso: 'rrhh.fondos:editar',
  schema: entregaSchema,
  handler: (d, { db }) => choferRepository(db).registrarEntrega(d),
  invalida: rutasFondos,
});
export const cargarGastoOficina = createAction({
  permiso: 'rrhh.fondos:editar',
  schema: gastoOficinaSchema,
  handler: (d, { db }) => choferRepository(db).cargarGasto(d),
  invalida: rutasFondos,
});
export const revisarGasto = createAction({
  permiso: 'rrhh.fondos:transicionar',
  schema: revisarGastoSchema,
  handler: (d, { db }) => choferRepository(db).revisarGasto(d.gastoId, d.aprobar, d.motivo),
  invalida: rutasFondos,
});
export const anularMovimientoFondo = createAction({
  permiso: 'rrhh.fondos:transicionar',
  schema: anularMovimientoSchema,
  handler: (d, { db }) => choferRepository(db).anularMovimiento(d.movimientoId, d.motivo),
  invalida: rutasFondos,
});
export const cerrarFondo = createAction({
  permiso: 'rrhh.fondos:transicionar',
  schema: cerrarFondoSchema,
  handler: (d, { db }) => choferRepository(db).cerrarFondo(d.choferId, d.periodo),
  invalida: rutasFondos,
});
export const reabrirFondo = createAction({
  permiso: 'rrhh.fondos:transicionar',
  schema: reabrirFondoSchema,
  handler: (d, { db }) => choferRepository(db).reabrirFondo(d.choferId, d.periodo, d.motivo),
  invalida: rutasFondos,
});
