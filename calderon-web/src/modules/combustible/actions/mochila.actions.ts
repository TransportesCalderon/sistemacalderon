'use server';

import { createAction } from '@/server/actions/create-action';
import { cerrarUsoSchema, cerrarVigenciaSchema, controlAltaSchema, puestaEnMarchaSchema, usoMochilaAltaSchema } from '../domain/mochila.schemas';
import { mochilaService } from '../services/mochila.service';

/**
 * Server actions de Mochilas y controles (fila combustible.depositos):
 *  - editar: uso de mochila y controles (tc_app);
 *  - transicionar: puesta en marcha y cierre de vigencia de una mochila (la base exige tc_admin).
 */
const rutas = (camionId?: number) => ({
  paths: ['/combustible/mochilas', '/combustible/viajes', ...(camionId ? [`/combustible/mochilas/${camionId}`] : [])],
});

export const ponerEnMarchaMochila = createAction({
  permiso: 'combustible.depositos:transicionar',
  schema: puestaEnMarchaSchema,
  handler: (d, { db }) => mochilaService(db).ponerEnMarcha(d),
  invalida: ({ camionId }) => rutas(camionId),
});

export const registrarUsoMochila = createAction({
  permiso: 'combustible.depositos:editar',
  schema: usoMochilaAltaSchema,
  handler: ({ camionId, paradaDesdeId }, { db }) => mochilaService(db).registrarUso(camionId, paradaDesdeId),
  invalida: ({ camionId }) => rutas(camionId),
});

export const cerrarUsoMochila = createAction({
  permiso: 'combustible.depositos:editar',
  schema: cerrarUsoSchema,
  handler: ({ usoId, versionFila, paradaHastaId }, { db }) => mochilaService(db).cerrarUso(usoId, versionFila, paradaHastaId),
  invalida: () => rutas(),
});

export const cerrarVigenciaMochila = createAction({
  permiso: 'combustible.depositos:transicionar',
  schema: cerrarVigenciaSchema,
  handler: ({ depositoId, versionFila, paradaHastaId }, { db }) => mochilaService(db).cerrarVigencia(depositoId, versionFila, paradaHastaId),
  invalida: () => rutas(),
});

export const registrarControlMochila = createAction({
  permiso: 'combustible.depositos:editar',
  schema: controlAltaSchema,
  handler: (d, { db, sesion }) => mochilaService(db).registrarControl(d, sesion.identidad.usuarioId),
  invalida: () => rutas(),
});
