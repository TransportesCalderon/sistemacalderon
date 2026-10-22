'use server';

import { z } from 'zod';
import { createAction } from '@/server/actions/create-action';
import { iaRepository } from './ia.repository';

/** Pedir una lectura con IA (migración 64). La base vuelve a controlar quién puede y los topes. */
const lectura = (tipo: 'ticket_combustible' | 'comprobante_gasto') =>
  z.object({
    tipo: z.literal(tipo),
    base64: z.string().min(16).max(6_000_000).regex(/^[A-Za-z0-9+/=]+$/, 'No llegó la foto.'),
    mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'], 'La IA lee fotos JPG, PNG o WEBP, o un PDF.'),
  });

export const leerTicketCombustible = createAction({
  permiso: 'combustible.cargas:editar',
  schema: lectura('ticket_combustible'),
  handler: (d, { db }) => iaRepository(db).leer(d.tipo, d.base64, d.mediaType),
});

export const leerComprobanteGasto = createAction({
  permiso: 'chofer.mis_gastos:editar',
  schema: lectura('comprobante_gasto'),
  handler: (d, { db }) => iaRepository(db).leer(d.tipo, d.base64, d.mediaType),
});

const usada = z.object({ lecturaId: z.number().int().positive(), guardado: z.record(z.string(), z.unknown()) });
export const marcarLecturaCombustible = createAction({
  permiso: 'combustible.cargas:editar',
  schema: usada,
  handler: (d, { db }) => iaRepository(db).marcarUsada(d.lecturaId, d.guardado),
});
export const marcarLecturaGasto = createAction({
  permiso: 'chofer.mis_gastos:editar',
  schema: usada,
  handler: (d, { db }) => iaRepository(db).marcarUsada(d.lecturaId, d.guardado),
});
