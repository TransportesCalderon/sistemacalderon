'use server';

import { z } from 'zod';
import { createAction } from '@/server/actions/create-action';
import { iaRepository } from '@/modules/ia/ia.repository';
import { ordenCargaRepository } from '../repositories/orden-carga.repository';

/**
 * Migración 234 · Órdenes de carga de combustible. La base decide quién puede (Gerencia genera y anula; el chofer
 * termina la suya) y valida todo; acá solo se revisa la forma de los datos.
 */
const id = z.number().int().positive();

export const crearOrdenCarga = createAction({
  permiso: 'combustible.ordenes:editar',
  schema: z.object({
    camionId: id.nullable(),
    estacionId: id.nullable(),
    modo: z.enum(['litros', 'importe', 'llenar']),
    litros: z.number().finite().nullable(),
    importe: z.number().finite().nullable(),
    moneda: z.string().max(5).nullable(),
    choferId: id.nullable(),
    observacion: z.string().max(500).nullable(),
  }),
  handler: (d, { db }) => ordenCargaRepository(db).crear(d),
});

export const anularOrdenCarga = createAction({
  permiso: 'combustible.ordenes:editar',
  schema: z.object({ id, motivo: z.string().max(500) }),
  handler: (d, { db }) => ordenCargaRepository(db).anular(d.id, d.motivo),
});

export const revisarOrdenCarga = createAction({
  permiso: 'combustible.ordenes:ver',
  schema: z.object({ id }),
  handler: (d, { db }) => ordenCargaRepository(db).revisar(d.id),
});

export const guardarCorreoEstacion = createAction({
  permiso: 'combustible.ordenes:ver',
  schema: z.object({ estacionId: id, correo: z.string().max(500) }),
  handler: (d, { db }) => ordenCargaRepository(db).correoEstacion(d.estacionId, d.correo),
});

// El chofer
export const terminarOrdenCarga = createAction({
  permiso: 'chofer.mi_carga:editar',
  schema: z.object({
    id,
    fotos: z.array(z.object({ ruta: z.string().min(1).max(300), hash: z.string().max(100) })).min(1).max(5),
    lecturas: z.array(id).max(5),
    litros: z.number().finite().positive().nullable(),
  }),
  handler: (d, { db }) => ordenCargaRepository(db).terminar(d.id, d.fotos, d.lecturas, d.litros),
});

export const leerTicketChofer = createAction({
  permiso: 'chofer.mi_carga:editar',
  schema: z.object({
    base64: z.string().min(16).max(6_000_000).regex(/^[A-Za-z0-9+/=]+$/, 'No llegó la foto.'),
    mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp'], 'La IA lee fotos JPG, PNG o WEBP.'),
  }),
  handler: (d, { db }) => iaRepository(db).leer('ticket_combustible', d.base64, d.mediaType),
});

// Migración 236: conectar la cuenta de mail (Hotmail) y probar el envío. La base exige TI o Gerencia.
export const urlPermisoMail = createAction({
  permiso: 'combustible.ordenes:editar',
  schema: z.object({ volver: z.string().url().max(300) }),
  handler: (d, { db }) => ordenCargaRepository(db).urlPermisoMail(d.volver),
});

export const probarMail = createAction({
  permiso: 'combustible.ordenes:editar',
  schema: z.object({}),
  handler: (_d, { db }) => ordenCargaRepository(db).probarMail(),
});
