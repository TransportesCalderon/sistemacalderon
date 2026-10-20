'use server';

import { headers } from 'next/headers';
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
