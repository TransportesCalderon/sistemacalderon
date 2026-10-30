'use server';

import { z } from 'zod';
import { createAction } from '@/server/actions/create-action';
import { abrirLinkMaps } from '@/server/externos/maps';
import { esLinkDeMaps } from '../domain/rutas';
import { rutasRepository } from '../repositories/rutas.repository';

/** Rutas para los choferes (migración 135). La base vuelve a controlar permisos y puntos. */
const rutas = () => ({ paths: ['/operacion/lineas', '/ajustes/lineas', '/mi-viaje', '/operacion/operaciones'] });

const punto = z.object({ nombre: z.string().max(200), lat: z.number().nullable(), lng: z.number().nullable() });

export const guardarRuta = createAction({
  permiso: 'operacion.rutas:editar',
  schema: z.object({
    id: z.number().int().positive().nullable(),
    version: z.number().int().nullable(),
    lineaId: z.number().int().positive(),
    nombre: z.string().max(200),
    notas: z.string().max(2000),
    puntos: z.array(punto).max(60),
    linkOriginal: z.string().max(4000).nullable(),
    predeterminada: z.boolean(),
  }),
  handler: (d, { db }) => rutasRepository(db).guardar(d),
  invalida: rutas,
});

export const quitarRuta = createAction({
  permiso: 'operacion.rutas:editar',
  schema: z.object({ id: z.number().int().positive(), version: z.number().int() }),
  handler: (d, { db }) => rutasRepository(db).quitar(d.id, d.version),
  invalida: rutas,
});

export const elegirRuta = createAction({
  permiso: 'operacion.rutas:editar',
  schema: z.object({ servicioId: z.number().int().positive(), rutaId: z.number().int().positive().nullable() }),
  handler: (d, { db }) => rutasRepository(db).elegir(d.servicioId, d.rutaId),
  invalida: rutas,
});

/** Abre un link corto de Google Maps (maps.app.goo.gl) y devuelve el link largo, para leer sus puntos. */
export const abrirLinkCorto = createAction({
  permiso: 'operacion.rutas:editar',
  schema: z.object({ link: z.string().max(2000).refine(esLinkDeMaps, 'Pegá un link de Google Maps') }),
  handler: async (d) => abrirLinkMaps(d.link),
});
