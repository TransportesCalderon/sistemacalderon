'use server';

import { createAction } from '@/server/actions/create-action';
import {
  anularSchema,
  conciliarSchema,
  crearDesdeLineaSchema,
  cuentaContableSchema,
  cuentaDineroSchema,
  gastoFijoSchema,
  gastoSchema,
  ignorarSchema,
  medioPagoSchema,
  vincularCargasSchema,
  importarCartolaSchema,
  lineaSchema,
  movimientoSchema,
  periodoSchema,
  proveedorSchema,
} from '../domain/finanzas.schemas';
import { confirmarCambiosSchema } from '../domain/cambios';
import { cambiosRepository } from '../repositories/cambios.repository';
import { finanzasRepository as repo } from '../repositories/finanzas.repository';
import { z } from 'zod';

/**
 * Escrituras de Finanzas (migración 73). El permiso de la pantalla es el primer filtro;
 * la base vuelve a exigir el rol (Finanzas o TI) y valida todo.
 */
const RUTAS = { paths: ['/finanzas'] };

export const guardarCuentaContable = createAction({
  permiso: 'finanzas.plan_cuentas:editar',
  schema: cuentaContableSchema,
  handler: (d, { db }) => repo(db).guardarCuentaContable(d),
  invalida: () => RUTAS,
});
export const guardarProveedorRapido = createAction({
  permiso: 'finanzas.gastos:editar',
  schema: proveedorSchema,
  handler: (d, { db }) => repo(db).guardarProveedor(d),
  invalida: () => RUTAS,
});
export const guardarCuentaDinero = createAction({
  permiso: 'finanzas.bancos:editar',
  schema: cuentaDineroSchema,
  handler: (d, { db }) => repo(db).guardarCuentaDinero(d),
  invalida: () => RUTAS,
});
export const guardarGasto = createAction({
  permiso: 'finanzas.gastos:editar',
  schema: gastoSchema,
  handler: (d, { db }) => repo(db).guardarGasto(d),
  invalida: () => RUTAS,
});
export const anularGasto = createAction({
  permiso: 'finanzas.gastos:transicionar',
  schema: anularSchema,
  handler: (d, { db }) => repo(db).anularGasto(d.id, d.motivo),
  invalida: () => RUTAS,
});
export const guardarGastoFijo = createAction({
  permiso: 'finanzas.gastos:editar',
  schema: gastoFijoSchema,
  handler: (d, { db }) => repo(db).guardarGastoFijo(d),
  invalida: () => RUTAS,
});
export const generarGastosFijos = createAction({
  permiso: 'finanzas.gastos:editar',
  schema: periodoSchema,
  handler: (d, { db }) => repo(db).generarGastosFijos(d.periodo),
  invalida: () => RUTAS,
});
export const registrarMovimiento = createAction({
  permiso: 'finanzas.cobros_pagos:editar',
  schema: movimientoSchema,
  handler: (d, { db }) => repo(db).registrarMovimiento(d),
  invalida: () => RUTAS,
});
export const anularMovimiento = createAction({
  permiso: 'finanzas.cobros_pagos:transicionar',
  schema: anularSchema,
  handler: (d, { db }) => repo(db).anularMovimiento(d.id, d.motivo),
  invalida: () => RUTAS,
});
export const importarCartola = createAction({
  permiso: 'finanzas.bancos:editar',
  schema: importarCartolaSchema,
  handler: (d, { db }) => repo(db).importarCartola(d),
  invalida: () => RUTAS,
});
export const conciliar = createAction({
  permiso: 'finanzas.bancos:editar',
  schema: conciliarSchema,
  handler: (d, { db }) => repo(db).conciliar(d.lineaId, d.movimientoId),
  invalida: () => RUTAS,
});
export const desconciliar = createAction({
  permiso: 'finanzas.bancos:editar',
  schema: lineaSchema,
  handler: (d, { db }) => repo(db).desconciliar(d.lineaId),
  invalida: () => RUTAS,
});
export const ignorarLinea = createAction({
  permiso: 'finanzas.bancos:editar',
  schema: ignorarSchema,
  handler: (d, { db }) => repo(db).ignorarLinea(d.lineaId, d.ignorar),
  invalida: () => RUTAS,
});
export const crearDesdeLinea = createAction({
  permiso: 'finanzas.bancos:editar',
  schema: crearDesdeLineaSchema,
  handler: (d, { db }) => repo(db).crearDesdeLinea(d),
  invalida: () => RUTAS,
});
export const recontabilizar = createAction({
  permiso: 'finanzas.plan_cuentas:editar',
  schema: z.object({}),
  handler: (_d, { db }) => repo(db).recontabilizar(),
  invalida: () => RUTAS,
});

// Migración 74
export const guardarMedioPago = createAction({
  permiso: 'finanzas.gastos:editar',
  schema: medioPagoSchema,
  handler: (d, { db }) => repo(db).guardarMedioPago(d),
  invalida: () => RUTAS,
});
export const vincularCargas = createAction({
  permiso: 'finanzas.gastos:editar',
  schema: vincularCargasSchema,
  handler: (d, { db }) => repo(db).vincularCargas(d.gastoId, d.cargas),
  invalida: () => RUTAS,
});

/** Migración 123: confirmar los cambios de moneda propuestos (la base exige Finanzas o TI). */
export const confirmarCambios = createAction({
  permiso: 'finanzas.bancos:editar',
  schema: confirmarCambiosSchema,
  handler: (d, { db }) => cambiosRepository(db).confirmar(d.pares),
  invalida: () => RUTAS,
});
