'use server';

import { z } from 'zod';
import { createAction } from '@/server/actions/create-action';
import { vencimientosRepository } from '../repositories/vencimientos.repository';

/** Migración 198: vencimientos de técnicas y matafuegos. La base vuelve a controlar roles y fechas. */
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida');

export const registrarVencimiento = createAction({
  permiso: 'mantenimiento.vencimientos:editar',
  schema: z.object({
    tipo: z.string().min(1, 'Elegí qué vence'),
    equipo: z.enum(['tractor', 'semi']),
    equipoId: z.number().int().positive(),
    detalle: z.string().max(80).nullable(),
    realizado: fecha.nullable(),
    vence: fecha,
    observacion: z.string().max(500).nullable(),
  }),
  handler: (d, { db }) => vencimientosRepository(db).registrar(d),
});

export const anularVencimiento = createAction({
  permiso: 'mantenimiento.vencimientos:transicionar',
  schema: z.object({ id: z.number().int().positive(), motivo: z.string().max(300) }),
  handler: (d, { db }) => vencimientosRepository(db).anular(d.id, d.motivo),
});

/** «Entendido» en la ventana (vuelve al día siguiente). */
export const vencimientoVisto = createAction({
  permiso: 'mantenimiento.vencimientos:ver',
  schema: z.object({ id: z.number().int().positive() }),
  handler: (d, { db }) => vencimientosRepository(db).visto(d.id),
});

/** Migración 201: adjuntar el certificado (PDF o foto) ya subido a vencimientos/<id>/. */
export const adjuntarVencimiento = createAction({
  permiso: 'mantenimiento.vencimientos:editar',
  schema: z.object({ id: z.number().int().positive(), ruta: z.string().max(300), nombre: z.string().max(200).nullable() }),
  handler: (d, { db }) => vencimientosRepository(db).adjuntar(d.id, d.ruta, d.nombre),
});
