'use server';

import { createAction } from '@/server/actions/create-action';
import { ErrorNegocio } from '@/shared/lib/errores';
import { eliminarSchema, estacionSchema, parametroSchema, proveedorSchema, tipoCambioSchema } from '../domain/catalogos.schemas';
import { catalogosRepository } from '../repositories/catalogos.repository';

/**
 * Server actions de catálogos. Permisos de la matriz §16:
 *  - Proveedores y estaciones: comercial.proveedores (Adm. de combustible, Finanzas, TI).
 *  - Tipos de cambio: finanzas.tipos_cambio (Finanzas, TI).
 *  - Parámetros: configuracion.catalogos (TI).
 * La base vuelve a controlar con el rol tc_* del usuario.
 */
const comercial = () => ({ paths: ['/comercial/proveedores', '/comercial/estaciones', '/configuracion/catalogos'] });

export const guardarProveedor = createAction({
  permiso: 'comercial.proveedores:editar',
  schema: proveedorSchema,
  handler: (d, { db }) => catalogosRepository(db).guardarProveedor(d),
  invalida: comercial,
});

export const eliminarProveedor = createAction({
  permiso: 'comercial.proveedores:editar',
  schema: eliminarSchema,
  handler: (d, { db }) => catalogosRepository(db).eliminarProveedor(d),
  invalida: comercial,
});

export const guardarEstacion = createAction({
  permiso: 'comercial.proveedores:editar',
  schema: estacionSchema,
  handler: (d, { db }) => catalogosRepository(db).guardarEstacion(d),
  invalida: comercial,
});

export const eliminarEstacion = createAction({
  permiso: 'comercial.proveedores:editar',
  schema: eliminarSchema,
  handler: (d, { db }) => catalogosRepository(db).eliminarEstacion(d),
  invalida: comercial,
});

export const crearTipoCambio = createAction({
  permiso: 'finanzas.tipos_cambio:editar',
  schema: tipoCambioSchema,
  handler: (d, { db, sesion }) => {
    if (!sesion.monedaBase) throw new ErrorNegocio('regla_negocio', 'Falta definir la moneda base.');
    return catalogosRepository(db).crearTipoCambio(d, sesion.monedaBase);
  },
  invalida: () => ({ paths: ['/finanzas/tipos-cambio'] }),
});

export const eliminarTipoCambio = createAction({
  permiso: 'finanzas.tipos_cambio:editar',
  schema: eliminarSchema,
  handler: (d, { db }) => catalogosRepository(db).eliminarTipoCambio(d),
  invalida: () => ({ paths: ['/finanzas/tipos-cambio'] }),
});

export const guardarParametro = createAction({
  permiso: 'configuracion.catalogos:editar',
  schema: parametroSchema,
  handler: (d, { db }) => catalogosRepository(db).guardarParametro(d),
  invalida: () => ({ paths: ['/configuracion/parametros'] }),
});
