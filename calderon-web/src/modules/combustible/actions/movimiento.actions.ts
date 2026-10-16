'use server';

import { createAction } from '@/server/actions/create-action';
import { resolverSolicitudSchema, retirarSolicitudSchema } from '../domain/carga.schemas';
import { descargaSchema, movimientoConMotivoSchema, resolverMovimientoSchema, solicitarReversoSchema } from '../domain/movimiento.schemas';
import { movimientoService } from '../services/movimiento.service';

/**
 * Server actions de Movimientos del camión (fila combustible.movimientos):
 *  - editar: registrar una descarga o un movimiento con motivo, pedir o retirar un reverso;
 *  - transicionar: aprobar o rechazar un movimiento con motivo o un reverso pedido por otro usuario.
 * Quién puede aprobar (otro usuario, rol aprobador) y si el período está abierto lo decide la base.
 */
const rutas = () => ({ paths: ['/combustible/movimientos', '/combustible/viajes', '/combustible/cierres'] });

export const registrarDescarga = createAction({
  permiso: 'combustible.movimientos:editar',
  schema: descargaSchema,
  handler: (d, { db }) => movimientoService(db).descargar(d),
  invalida: rutas,
});

export const registrarMovimientoConMotivo = createAction({
  permiso: 'combustible.movimientos:editar',
  schema: movimientoConMotivoSchema,
  handler: (d, { db }) => movimientoService(db).conMotivo(d),
  invalida: rutas,
});

export const resolverMovimiento = createAction({
  permiso: 'combustible.movimientos:transicionar',
  schema: resolverMovimientoSchema,
  handler: ({ movimientoId, aprobar, motivo }, { db }) => movimientoService(db).resolver(movimientoId, aprobar, motivo),
  invalida: rutas,
});

export const solicitarReversoMovimiento = createAction({
  permiso: 'combustible.movimientos:editar',
  schema: solicitarReversoSchema,
  handler: ({ movimientoId, motivo }, { db }) => movimientoService(db).solicitarReverso(movimientoId, motivo),
  invalida: rutas,
});

/** La solicitud de reverso se resuelve con la misma función de la base que la anulación de una carga. */
export const resolverReversoMovimiento = createAction({
  permiso: 'combustible.movimientos:transicionar',
  schema: resolverSolicitudSchema,
  handler: ({ solicitudId, aprobar, motivo }, { db }) => movimientoService(db).resolverReverso(solicitudId, aprobar, motivo),
  invalida: rutas,
});

export const retirarReversoMovimiento = createAction({
  permiso: 'combustible.movimientos:editar',
  schema: retirarSolicitudSchema,
  handler: ({ solicitudId }, { db }) => movimientoService(db).retirarReverso(solicitudId),
  invalida: rutas,
});
