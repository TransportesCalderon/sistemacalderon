'use server';

import { z } from 'zod';
import { createAction } from '@/server/actions/create-action';
import { tableroRepository } from '../repositories/tablero.repository';

/**
 * Tablero del camión (migración 88). El chofer desde su celular; la oficina desde el cierre.
 * La base vuelve a decidir quién puede (el chofer, solo sus camiones) y revisa los datos.
 */
const num = z.number().finite().nonnegative().optional();
const datos = z.object({
  odometro_km: num,
  km: num,
  litros: num,
  ralenti_l: num,
  pto_l: num,
  horas: num,
  ralenti_h: num,
  pto_h: num,
  velocidad_media_kmh: num,
  l_100km: num,
  programador_pct: num,
  puntaje: num,
  puntaje_escala: num,
  partes: z.record(z.string().max(40), z.number().finite()).optional(),
  marca: z.string().max(30).optional(),
});
const guardar = z.object({
  camionId: z.number().int().positive(),
  datos,
  lecturas: z.array(z.number().int().positive()).max(10),
  fotos: z.array(z.object({ ruta: z.string().min(1).max(300), hash: z.string().max(64) })).max(10),
});

export const guardarTableroChofer = createAction({
  permiso: 'chofer.mi_carga:editar',
  schema: guardar,
  handler: (d, { db }) => tableroRepository(db).guardar(d),
  invalida: () => ({ paths: ['/chofer', '/chofer/tablero'] }),
});
export const guardarTableroOficina = createAction({
  permiso: 'combustible.cierre_viaje:editar',
  schema: guardar,
  handler: (d, { db }) => tableroRepository(db).guardar(d),
});

const anular = z.object({ id: z.number().int().positive() });
export const anularTableroChofer = createAction({
  permiso: 'chofer.mi_carga:editar',
  schema: anular,
  handler: (d, { db }) => tableroRepository(db).anular(d.id),
});
export const anularTableroOficina = createAction({
  permiso: 'combustible.cierre_viaje:editar',
  schema: anular,
  handler: (d, { db }) => tableroRepository(db).anular(d.id),
});

export const avisoCargaVisto = createAction({
  permiso: 'chofer.mi_carga:editar',
  schema: z.object({ id: z.number().int().positive() }),
  handler: (d, { db }) => tableroRepository(db).avisoVisto(d.id),
});
