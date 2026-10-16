'use server';

import { createAction } from '@/server/actions/create-action';
import {
  cargaAltaSchema,
  confirmarAparteSchema,
  resolverSolicitudSchema,
  retirarSolicitudSchema,
  solicitarAnulacionSchema,
} from '../domain/carga.schemas';
import { cargaService } from '../services/carga.service';

/**
 * Server actions de Combustible > Cargas (matriz §16, fila combustible.cargas):
 *  - editar: alta, pedir o retirar una anulación, confirmar una carga de mochila aparte;
 *  - transicionar: aprobar o rechazar la anulación pedida por otro usuario.
 * El error de la base se muestra tal cual (createAction → traducirErrorDb).
 */
const rutas = (id?: number | null) => ({
  paths: ['/combustible/cargas', '/combustible/viajes', ...(id ? [`/combustible/cargas/${id}`] : [])],
});

export const crearCarga = createAction({
  permiso: 'combustible.cargas:editar',
  schema: cargaAltaSchema,
  handler: (d, { db }) => cargaService(db).crear(d),
  invalida: (_d, id) => rutas(id),
});

export const solicitarAnulacionCarga = createAction({
  permiso: 'combustible.cargas:editar',
  schema: solicitarAnulacionSchema,
  handler: ({ cargaId, motivo }, { db }) => cargaService(db).solicitarAnulacion(cargaId, motivo),
  invalida: ({ cargaId }) => rutas(cargaId),
});

export const resolverSolicitudCarga = createAction({
  permiso: 'combustible.cargas:transicionar',
  schema: resolverSolicitudSchema,
  handler: ({ solicitudId, aprobar, motivo }, { db }) => cargaService(db).resolver(solicitudId, aprobar, motivo),
  invalida: (_d, cargaId) => rutas(cargaId),
});

export const retirarSolicitudCarga = createAction({
  permiso: 'combustible.cargas:editar',
  schema: retirarSolicitudSchema,
  handler: ({ solicitudId }, { db }) => cargaService(db).retirar(solicitudId),
  invalida: (_d, cargaId) => rutas(cargaId),
});

export const confirmarCargaAparte = createAction({
  permiso: 'combustible.cargas:editar',
  schema: confirmarAparteSchema,
  handler: ({ cargaId, versionFila }, { db }) => cargaService(db).confirmarAparte(cargaId, versionFila),
  invalida: ({ cargaId }) => rutas(cargaId),
});
