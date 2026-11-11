'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { isIP } from 'node:net';
import { alcanceDe } from '@/modules/core/permissions/resolver';
import { createAction } from '@/server/actions/create-action';
import { choferAltaSchema, choferEdicionSchema, eliminarChoferSchema, revelarDocumentoSchema } from '../domain/chofer.schemas';
import { choferService } from '../services/chofer.service';

/**
 * Server actions de Flota > Choferes (matriz §16):
 *  - flota.choferes:editar          alta y edición (Operaciones, RR. HH., TI; Chofer solo lo propio)
 *  - flota.documento_chofer:editar  cambiar el documento (RR. HH.)
 *  - flota.documento_chofer:ver     mostrar el documento (Analista, RR. HH., TI, Auditor), con registro
 */
export const crearChofer = createAction({
  permiso: 'flota.choferes:editar',
  schema: choferAltaSchema,
  handler: (datos, { db, alcance }) => choferService(db).crear(datos, { alcance }),
  invalida: (_d, chofer) => ({ paths: ['/flota/choferes', `/flota/choferes/${chofer.id}`] }),
});

export const editarChofer = createAction({
  permiso: 'flota.choferes:editar',
  schema: choferEdicionSchema,
  handler: (input, { db, alcance, sesion }) =>
    choferService(db).editar(input, {
      alcance,
      choferIdSesion: sesion.identidad.choferId,
      puedeCambiarDocumento: alcanceDe(sesion.permisos, 'flota.documento_chofer:editar') === 'todo',
    }),
  invalida: ({ id }) => ({ paths: ['/flota/choferes', `/flota/choferes/${id}`] }),
});

export const revelarDocumentoChofer = createAction({
  permiso: 'flota.documento_chofer:ver',
  schema: revelarDocumentoSchema,
  handler: async ({ id }, { db, alcance, sesion }) => {
    const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
    return choferService(db).revelarDocumento(id, { alcance, choferIdSesion: sesion.identidad.choferId }, ip && isIP(ip) ? ip : null);
  },
});


/** Migración 45: eliminar chofer (flota.choferes:editar con alcance total). */
export const eliminarChofer = createAction({
  permiso: 'flota.choferes:editar',
  schema: eliminarChoferSchema,
  handler: ({ id, motivo }, { db, alcance }) => choferService(db).eliminar(id, motivo, { alcance }),
  invalida: ({ id }) => ({ paths: ['/flota/choferes', `/flota/choferes/${id}`] }),
});

/**
 * Migración 239: poner, cambiar o quitar la foto de perfil (la oficina; la base exige Operaciones, RRHH o TI).
 * La foto ya está subida a la carpeta del chofer; devuelve la anterior para borrar el archivo.
 */
export const guardarFotoChofer = createAction({
  permiso: 'flota.choferes:editar',
  schema: z.object({
    choferId: z.number().int().positive(),
    ruta: z.string().max(200).nullable(),
    /** Migración 245: copia chica (JPEG base64) para el mail de la orden de carga. */
    mini: z.string().max(80_000).regex(/^[A-Za-z0-9+/=]+$/).nullable().optional(),
  }),
  handler: async ({ choferId, ruta, mini }, { db }) => {
    const { data, error } = await db.schema('mae').rpc('fn_foto_chofer', { p_chofer: choferId, p_ruta: ruta, p_mini: mini ?? null });
    if (error) throw error;
    const anterior = (data as { anterior?: string | null } | null)?.anterior;
    return { anterior: typeof anterior === 'string' ? anterior : null };
  },
});

/** Migración 246: completar la copia chica de una foto cargada antes (para el mail de la orden de carga). */
export const asegurarMiniFoto = createAction({
  permiso: ['flota.choferes:editar', 'combustible.ordenes:editar'],
  schema: z.object({ choferId: z.number().int().positive(), mini: z.string().max(80_000).regex(/^[A-Za-z0-9+/=]+$/) }),
  handler: async ({ choferId, mini }, { db }) => {
    const { error } = await db.schema('mae').rpc('fn_foto_chofer_mini', { p_chofer: choferId, p_mini: mini });
    if (error) throw error;
    return null;
  },
});
