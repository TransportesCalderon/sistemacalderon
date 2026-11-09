'use server';

import { z } from 'zod';
import { createAction } from '@/server/actions/create-action';
import { mantenimientoRepository } from '../repositories/mantenimiento.repository';

/** Migración 199: plan de mantenimiento y órdenes de trabajo. La base vuelve a controlar roles, estados y datos. */
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida');
const equipo = z.enum(['tractor', 'semi', 'genset']);
const prioridad = z.enum(['normal', 'alta', 'urgente']);
const entero = z.number().int().nullable();
const id = z.number().int().positive();

export const guardarTarea = createAction({
  permiso: 'mantenimiento.plan:editar',
  schema: z.object({
    id: id.nullable(),
    version: entero,
    nombre: z.string().max(80),
    descripcion: z.string().max(1000).nullable(),
    aplica: equipo,
    marca: z.string().max(40).nullable(),
    tipoSemi: z.string().max(20).nullable(),
    cadaDias: entero,
    cadaKm: entero,
    avisoDias: z.number().int(),
    avisoKm: z.number().int(),
    cadaHoras: entero.optional(),
    avisoHoras: z.number().int().optional(),
    zonas: z.array(z.string().max(30)).max(20),
    prioridad,
    activo: z.boolean(),
  }),
  handler: (d, { db }) => mantenimientoRepository(db).guardarTarea(d),
});

export const cargarBaseTarea = createAction({
  permiso: 'mantenimiento.plan:editar',
  schema: z.object({ tarea: id, equipo, equipoId: id, fecha, km: z.number().nullable() }),
  handler: (d, { db }) => mantenimientoRepository(db).baseTarea(d.tarea, d.equipo, d.equipoId, d.fecha, d.km),
});

export const crearOt = createAction({
  permiso: 'mantenimiento.ordenes:editar',
  schema: z.object({
    equipo,
    equipoId: id,
    titulo: z.string().max(120),
    descripcion: z.string().max(2000).nullable(),
    zonas: z.array(z.string().max(30)).max(20),
    prioridad,
    fechaLimite: fecha.nullable(),
    asignado: id.nullable(),
  }),
  handler: (d, { db }) => mantenimientoRepository(db).crearOt(d),
});

/** Asignar (el Jefe) o tomarla uno mismo (el mecánico, si está sin asignar): lo decide la base. */
export const asignarOt = createAction({
  permiso: 'mantenimiento.ordenes:editar',
  schema: z.object({ id, usuario: id.nullable() }),
  handler: (d, { db }) => mantenimientoRepository(db).asignar(d.id, d.usuario),
});

export const iniciarOt = createAction({
  permiso: 'mantenimiento.ordenes:editar',
  schema: z.object({ id }),
  handler: (d, { db }) => mantenimientoRepository(db).iniciar(d.id),
});

export const terminarOt = createAction({
  permiso: 'mantenimiento.ordenes:editar',
  schema: z.object({
    id,
    trabajo: z.string().max(2000),
    km: z.number().nullable(),
    repuestos: z.string().max(1000).nullable(),
    costo: z.number().nullable(),
    moneda: z.string().length(3).nullable(),
    proveedor: z.string().max(120).nullable(),
  }),
  handler: (d, { db }) => mantenimientoRepository(db).terminar(d),
});

export const verificarOt = createAction({
  permiso: 'mantenimiento.ordenes:transicionar',
  schema: z.object({ id, ok: z.boolean(), comentario: z.string().max(1000).nullable() }),
  handler: (d, { db }) => mantenimientoRepository(db).verificar(d.id, d.ok, d.comentario),
});

/** Anula el Jefe, Gerencia o TI, o quien la pidió si no se empezó (lo decide la base). */
export const anularOt = createAction({
  permiso: 'mantenimiento.ordenes:ver',
  schema: z.object({ id, motivo: z.string().max(500) }),
  handler: (d, { db }) => mantenimientoRepository(db).anular(d.id, d.motivo),
});

export const notaOt = createAction({
  permiso: 'mantenimiento.ordenes:ver',
  schema: z.object({ id, texto: z.string().max(1000) }),
  handler: (d, { db }) => mantenimientoRepository(db).nota(d.id, d.texto),
});

export const otVista = createAction({
  permiso: 'mantenimiento.ordenes:ver',
  schema: z.object({ id }),
  handler: (d, { db }) => mantenimientoRepository(db).visto(d.id),
});
