'use server';

import { createAction } from '@/server/actions/create-action';
import { anularPedidoTableroSchema, pedirTableroSchema } from '../domain/pedido-tablero';
import { pedidoTableroRepository } from '../repositories/pedido-tablero.repository';

/** Migración 297: pedirle al chofer la foto del tablero (Mercedes y Scania). Lo puede hacer Telemetría o TI (lo controla la base). */
export const pedirFotoTablero = createAction({
  permiso: 'telemetria.mapa:ver',
  schema: pedirTableroSchema,
  handler: (d, { db }) => pedidoTableroRepository(db).pedir(d.viajeId, d.motivo),
});

/** Migración 297: cancelar ese pedido (deja de frenar el pedido de dinero del chofer). */
export const anularPedidoTablero = createAction({
  permiso: 'telemetria.mapa:ver',
  schema: anularPedidoTableroSchema,
  handler: (d, { db }) => pedidoTableroRepository(db).anular(d.id),
});
