'use server';

import { createAction } from '@/server/actions/create-action';
import { documentoSchema, quitarDocumentoSchema, validarCargaSchema } from '../domain/documento.schemas';
import { documentoRepository } from '../repositories/documento.repository';

/**
 * Ticket de la carga y validación (migración 34).
 *  - Adjuntar o quitar el ticket: combustible.documentos:editar (el archivo ya lo subió el navegador a Storage).
 *  - Validar: combustible.cargas:transicionar. La base exige otro usuario con rol aprobador y el ticket adjunto.
 */
const rutas = (d: { cargaId: number }) => ({
  paths: [`/combustible/cargas/${d.cargaId}`, '/combustible/observadas', '/combustible/sin-documento', '/pendientes'],
});

export const adjuntarDocumento = createAction({
  permiso: 'combustible.documentos:editar',
  schema: documentoSchema,
  handler: (d, { db }) => documentoRepository(db).registrar(d),
  invalida: rutas,
});

export const quitarDocumento = createAction({
  permiso: 'combustible.documentos:editar',
  schema: quitarDocumentoSchema,
  handler: ({ documentoId }, { db }) => documentoRepository(db).quitar(documentoId),
  invalida: rutas,
});

export const validarCarga = createAction({
  permiso: 'combustible.cargas:transicionar',
  schema: validarCargaSchema,
  handler: ({ cargaId, motivo }, { db }) => documentoRepository(db).validar(cargaId, motivo),
  invalida: rutas,
});
