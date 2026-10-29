'use server';

import { z } from 'zod';
import { createAction } from '@/server/actions/create-action';
import { ErrorNegocio } from '@/shared/lib/errores';
import { pedirBcra, periodoBcra } from '@/server/externos/bcra';
import { eliminarSchema, estacionSchema, parametroSchema, proveedorSchema, tipoCambioSchema, ubicacionSchema } from '../domain/catalogos.schemas';
import { catalogosRepository } from '../repositories/catalogos.repository';
import { tipoCargaSchema } from '../domain/tipos-carga';

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

/** Ubicaciones (puertos, base, clientes): comercial.ubicaciones. La Pizarra Azul las usa como «Dónde». */
const ubicaciones = () => ({ paths: ['/comercial/ubicaciones', '/flota/pizarra', '/pizarra'] });

export const guardarUbicacion = createAction({
  permiso: 'comercial.ubicaciones:editar',
  schema: ubicacionSchema,
  handler: (d, { db }) => catalogosRepository(db).guardarUbicacion(d),
  invalida: ubicaciones,
});

export const eliminarUbicacion = createAction({
  permiso: 'comercial.ubicaciones:editar',
  schema: eliminarSchema,
  handler: (d, { db }) => catalogosRepository(db).eliminarUbicacion(d),
  invalida: ubicaciones,
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

export const actualizarCotizaciones = createAction({
  permiso: 'finanzas.tipos_cambio:editar',
  schema: z.object({}),
  handler: async (_d, { db }) => catalogosRepository(db).actualizarCotizaciones(await respuestaBcra()),
  invalida: () => ({ paths: ['/finanzas/tipos-cambio'] }),
});

/** La base solo la deja cambiar mientras no haya importes registrados. */
export const definirMonedaBase = createAction({
  permiso: 'configuracion.catalogos:editar',
  schema: z.object({ codigo: z.string().regex(/^[A-Z]{3}$/) }),
  handler: ({ codigo }, { db }) => catalogosRepository(db).definirMonedaBase(codigo),
  invalida: () => ({ paths: ['/configuracion/monedas', '/finanzas/tipos-cambio', '/configuracion/catalogos'] }),
});

/**
 * Pide al BCRA el tipo de cambio minorista de los últimos días desde el servidor de la aplicación
 * (la conexión desde Supabase se corta). Si falla, devuelve null y lo intenta la base.
 * Solo trae datos públicos: no usa ninguna clave.
 */
async function respuestaBcra(): Promise<unknown | null> {
  const p = periodoBcra();
  if (!p) return null;
  try {
    const r = await pedirBcra(p.desde, p.hasta);
    return r.status === 200 ? r.cuerpo : null;
  } catch {
    return null;
  }
}

/**
 * Migración 121 · Tipos de carga. Los pueden cambiar Gerencia o TI: eso lo decide la base
 * (ref.fn_guardar_tipo_carga); acá alcanza con poder ver Catálogos.
 */
export const guardarTipoCarga = createAction({
  permiso: 'configuracion.catalogos:ver',
  schema: tipoCargaSchema,
  handler: (d, { db }) => catalogosRepository(db).guardarTipoCarga(d),
  invalida: () => ({ paths: ['/ajustes/parametros/tipos-carga'] }),
});
