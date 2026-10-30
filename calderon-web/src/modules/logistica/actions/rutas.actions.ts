'use server';

import { z } from 'zod';
import { createAction } from '@/server/actions/create-action';
import { abrirLinkMaps } from '@/server/externos/maps';
import { esLinkDeMaps } from '../domain/rutas';
import { rutasRepository } from '../repositories/rutas.repository';

/** Ruta para el chofer de cada operación (migración 136). La base vuelve a controlar permisos y puntos. */
const rutas = () => ({ paths: ['/operacion/operaciones', '/mi-viaje'] });

const punto = z.object({ nombre: z.string().max(200), lat: z.number().nullable(), lng: z.number().nullable() });

export const guardarRutaOperacion = createAction({
  permiso: 'operacion.rutas:editar',
  schema: z.object({
    servicioId: z.number().int().positive(),
    version: z.number().int().nullable(),
    notas: z.string().max(2000),
    puntos: z.array(punto).max(60),
    linkOriginal: z.string().max(4000).nullable(),
  }),
  handler: (d, { db }) => rutasRepository(db).guardar(d),
  invalida: rutas,
});

export const quitarRutaOperacion = createAction({
  permiso: 'operacion.rutas:editar',
  schema: z.object({ servicioId: z.number().int().positive(), version: z.number().int() }),
  handler: (d, { db }) => rutasRepository(db).quitar(d.servicioId, d.version),
  invalida: rutas,
});

/** Abre un link corto de Google Maps (maps.app.goo.gl) y devuelve el link largo, para leer sus puntos. */
export const abrirLinkCorto = createAction({
  permiso: 'operacion.rutas:editar',
  schema: z.object({ link: z.string().max(2000).refine(esLinkDeMaps, 'Pegá un link de Google Maps') }),
  handler: async (d) => abrirLinkMaps(d.link),
});
