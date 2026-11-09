'use server';

import { z } from 'zod';
import { createAction } from '@/server/actions/create-action';
import { CATEGORIAS, UNIDADES } from '../domain/stock.types';
import { stockRepository } from '../repositories/stock.repository';

/** Migración 216: stock de insumos. La base vuelve a controlar roles, stock e importes. */
const id = z.number().int().positive();
const cantidad = z.number().positive().max(1e9);
const motivo = z.string().max(300);

export const guardarPanol = createAction({
  permiso: 'mantenimiento.stock:editar',
  schema: z.object({ id: id.nullable(), nombre: z.string().max(60), ubicacion: z.string().max(120).nullable(), activo: z.boolean() }),
  handler: (d, { db }) => stockRepository(db).guardarPanol(d.id, d.nombre, d.ubicacion, d.activo),
});

export const guardarInsumo = createAction({
  permiso: 'mantenimiento.stock:editar',
  schema: z.object({
    id: id.nullable(),
    codigo: z.string().max(30),
    nombre: z.string().max(120),
    unidad: z.enum(UNIDADES),
    categoria: z.enum(CATEGORIAS),
    stockMinimo: z.number().min(0).max(1e9),
    observacion: z.string().max(500).nullable(),
    activo: z.boolean(),
  }),
  handler: (d, { db }) => stockRepository(db).guardarInsumo(d),
});

export const ingresoInsumo = createAction({
  permiso: 'mantenimiento.stock:editar',
  schema: z.object({ insumo: id, panol: id, cantidad, costo: z.number().min(0).max(1e12), motivo }),
  handler: (d, { db }) => stockRepository(db).ingreso(d.insumo, d.panol, d.cantidad, d.costo, d.motivo),
});

/** Detallar una factura de insumos: el Jefe de mantenimiento, Finanzas o TI (lo decide la base). */
export const ingresoCompra = createAction({
  permiso: 'mantenimiento.stock:editar',
  schema: z.object({
    gasto: id,
    renglones: z.array(z.object({ insumoId: id, panolId: id, cantidad, neto: z.number().min(0).max(1e12) })).min(1).max(100),
  }),
  handler: (d, { db }) => stockRepository(db).compra(d.gasto, d.renglones),
});

export const traspasarInsumo = createAction({
  permiso: 'mantenimiento.stock:editar',
  schema: z.object({ insumo: id, desde: id, hasta: id, cantidad, motivo: motivo.nullable() }),
  handler: (d, { db }) => stockRepository(db).traspasar(d.insumo, d.desde, d.hasta, d.cantidad, d.motivo),
});

export const ajustarInsumo = createAction({
  permiso: 'mantenimiento.stock:editar',
  schema: z.object({ insumo: id, panol: id, contado: z.number().min(0).max(1e9), motivo, costo: z.number().min(0).max(1e12).nullable() }),
  handler: (d, { db }) => stockRepository(db).ajustar(d.insumo, d.panol, d.contado, d.motivo, d.costo),
});

/** Usar o devolver insumos en una OT: quienes trabajan las órdenes. */
export const consumirInsumo = createAction({
  permiso: 'mantenimiento.ordenes:editar',
  schema: z.object({ ot: id, insumo: id, panol: id, cantidad }),
  handler: (d, { db }) => stockRepository(db).consumir(d.ot, d.insumo, d.panol, d.cantidad),
});

export const devolverInsumo = createAction({
  permiso: 'mantenimiento.ordenes:editar',
  schema: z.object({ consumo: id, cantidad }),
  handler: (d, { db }) => stockRepository(db).devolver(d.consumo, d.cantidad),
});
