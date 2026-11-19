'use server';

import { z } from 'zod';
import { createAction } from '@/server/actions/create-action';
import { comprasRepository } from '../repositories/compras.repository';

/**
 * Migración 280 · Compras. Cargan Finanzas o TI; aprueban Gerencia o TI (la base lo exige y no deja que lo
 * resuelva quien cargó o mandó a aprobar el pedido). Toda validación está en la base.
 */
const id = z.number().int().positive();
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Elegí la fecha.');
const monto = z.number().min(0).max(99_999_999_999);
const texto = (max: number) => z.string().trim().max(max).nullable();
const RUTAS = { paths: ['/finanzas/gastos'] };

export const guardarPedidoCompra = createAction({
  permiso: 'finanzas.gastos:editar',
  schema: z.object({
    id: id.nullable(),
    version: z.number().int().nullable(),
    descripcion: z.string().trim().max(200),
    detalle: texto(2000),
    camionId: id.nullable(),
    urgente: z.boolean(),
  }),
  handler: (d, { db }) => comprasRepository(db).guardarPedido(d),
  invalida: () => RUTAS,
});

export const guardarCotizacionCompra = createAction({
  permiso: 'finanzas.gastos:editar',
  schema: z.object({
    id: id.nullable(),
    pedidoId: id,
    proveedorId: id,
    numeroProveedor: texto(40),
    fecha,
    validaHasta: fecha.nullable(),
    moneda: z.string().trim().length(3),
    total: monto,
    flete: monto,
    entregaInmediata: z.boolean(),
    entregaDias: z.number().int().min(0).max(365).nullable(),
    pagoDias: z.number().int().min(0).max(365),
    garantia: texto(120),
    observacion: texto(1000),
    archivoRuta: z.string().max(300).nullable(),
    archivoNombre: z.string().max(200).nullable(),
  }),
  handler: (d, { db }) => comprasRepository(db).guardarCotizacion(d),
  invalida: () => RUTAS,
});

export const anularCotizacionCompra = createAction({
  permiso: 'finanzas.gastos:editar',
  schema: z.object({ id, motivo: z.string().trim().min(1, 'Escribí el motivo.').max(500) }),
  handler: (d, { db }) => comprasRepository(db).anularCotizacion(d.id, d.motivo),
  invalida: () => RUTAS,
});

export const elevarPedidoCompra = createAction({
  permiso: 'finanzas.gastos:editar',
  schema: z.object({ id, nota: texto(1000) }),
  handler: (d, { db }) => comprasRepository(db).elevar(d.id, d.nota),
  invalida: () => RUTAS,
});

// Gerencia ve Gastos sin editar: la acción pide «ver» y la base exige Gerencia o TI
export const resolverPedidoCompra = createAction({
  permiso: 'finanzas.gastos:ver',
  schema: z.object({
    id,
    accion: z.enum(['aprobar', 'devolver', 'rechazar']),
    cotizacionId: id.nullable(),
    nota: texto(1000),
  }),
  handler: (d, { db }) => comprasRepository(db).resolver(d.id, d.accion, d.cotizacionId, d.nota),
  invalida: () => RUTAS,
});

export const anularPedidoCompra = createAction({
  permiso: 'finanzas.gastos:editar',
  schema: z.object({ id, motivo: z.string().trim().min(1, 'Escribí el motivo.').max(500) }),
  handler: (d, { db }) => comprasRepository(db).anularPedido(d.id, d.motivo),
  invalida: () => RUTAS,
});
