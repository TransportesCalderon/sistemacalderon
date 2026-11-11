'use server';

import { z } from 'zod';
import { createAction } from '@/server/actions/create-action';
import { seguimientoRepository } from '../repositories/seguimiento.repository';

/** Migración 194: registrar el control de un viaje en curso. Lo puede hacer Telemetría o TI (lo controla la base). */
export const registrarSeguimiento = createAction({
  permiso: 'telemetria.mapa:ver',
  schema: z.object({
    viajeId: z.number().int().positive(),
    km: z.number().positive().nullable(),
    litros: z.number().positive().nullable(),
    programador: z.number().min(0).max(100).nullable(),
    /** Migración 197: desde cuándo se mide (ISO); null = desde la salida. */
    desde: z.string().datetime({ offset: true }).nullable().optional(),
  }),
  handler: (d, { db }) => seguimientoRepository(db).registrar(d.viajeId, d.km, d.litros, d.programador, d.desde ?? null),
});

/** Migración 240: registrar el control con la foto de la computadora de a bordo (los números los puede corregir). */
export const registrarSeguimientoFoto = createAction({
  permiso: 'telemetria.mapa:ver',
  schema: z.object({
    viajeId: z.number().int().positive(),
    lecturaId: z.number().int().positive(),
    foto: z.string().max(200),
    desde: z.string().datetime({ offset: true }).nullable(),
    km: z.number().positive().nullable(),
    litros: z.number().positive().nullable(),
    programador: z.number().min(0).max(100).nullable(),
  }),
  handler: (d, { db }) => seguimientoRepository(db).registrarConFoto(d),
});

const opcional = z.number().min(0).nullable();

/** Migración 195: pedir la carga de combustible de un viaje en curso. Lo puede hacer Telemetría o TI (lo controla la base). */
export const pedirCarga = createAction({
  permiso: 'telemetria.mapa:ver',
  schema: z.object({
    viajeId: z.number().int().positive(),
    estacionId: z.number().int().positive({ message: 'Elegí la estación.' }),
    litros: z.number().positive({ message: 'Indicá los litros a cargar.' }),
    precio: z.number().positive().nullable(),
    km: opcional,
    gasto: opcional,
    tanques: opcional,
    mochila: opcional,
    programador: z.number().min(0).max(100).nullable(),
  }),
  handler: (d, { db }) => seguimientoRepository(db).pedirCarga(d),
});
