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

/** Migración 156: «Entendido» en la ventana emergente de un desvío (no vuelve a aparecer para ese usuario). */
export const marcarDesvioVisto = createAction({
  // Migración 168: los mismos que reciben la ventana (Analista de control y Gerencia) ven las rutas
  permiso: 'operacion.rutas:ver',
  schema: z.object({ id: z.number().int().positive() }),
  handler: (d, { db }) => rutasRepository(db).desvioVisto(d.id),
});

// Migración 158: varias rutas por operación
const datosTramo = z.object({
  servicioId: z.number().int().positive(),
  id: z.number().int().positive().nullable(),
  version: z.number().int().nullable(),
  notas: z.string().max(2000),
  puntos: z.array(punto).max(60),
  linkOriginal: z.string().max(4000).nullable(),
});
export const guardarRutaTramo = createAction({
  permiso: 'operacion.rutas:editar',
  schema: datosTramo,
  handler: (d, { db }) => rutasRepository(db).guardarTramo(d),
  invalida: rutas,
});
export const quitarRutaTramo = createAction({
  permiso: 'operacion.rutas:editar',
  schema: z.object({ id: z.number().int().positive(), version: z.number().int() }),
  handler: (d, { db }) => rutasRepository(db).quitarTramo(d.id, d.version),
  invalida: rutas,
});
export const moverRutaTramo = createAction({
  permiso: 'operacion.rutas:editar',
  schema: z.object({ id: z.number().int().positive(), dir: z.union([z.literal(-1), z.literal(1)]) }),
  handler: (d, { db }) => rutasRepository(db).moverTramo(d.id, d.dir),
  invalida: rutas,
});
export const llegadaRuta = createAction({
  permiso: 'operacion.rutas:editar',
  schema: z.object({ servicioId: z.number().int().positive(), llego: z.boolean() }),
  handler: (d, { db }) => rutasRepository(db).llegada(d.servicioId, d.llego),
  invalida: rutas,
});
/** El chofer: «Llegué al destino» (la base controla que la operación sea suya). */
export const llegueDestino = createAction({
  permiso: 'chofer.mi_carga:editar',
  schema: z.object({ servicioId: z.number().int().positive() }),
  handler: (d, { db }) => rutasRepository(db).llegueDestino(d.servicioId),
  invalida: rutas,
});

// Migración 161: rutas por chofer (con operación o movimiento)
const chofer = z.number().int().positive();
export const guardarRutaChofer = createAction({
  permiso: 'operacion.rutas:editar',
  schema: z.object({
    choferId: chofer,
    id: z.number().int().positive().nullable(),
    version: z.number().int().nullable(),
    servicioId: z.number().int().positive().nullable(),
    notas: z.string().max(2000),
    puntos: z.array(punto).max(60),
    linkOriginal: z.string().max(4000).nullable(),
  }),
  handler: (d, { db }) => rutasRepository(db).guardarChofer(d),
  invalida: rutas,
});
export const quitarRutaChofer = createAction({
  permiso: 'operacion.rutas:editar',
  schema: z.object({ choferId: chofer, id: z.number().int().positive(), version: z.number().int() }),
  handler: (d, { db }) => rutasRepository(db).quitarChofer(d.choferId, d.id, d.version),
  invalida: rutas,
});
export const moverRutaChofer = createAction({
  permiso: 'operacion.rutas:editar',
  schema: z.object({ choferId: chofer, id: z.number().int().positive(), dir: z.union([z.literal(-1), z.literal(1)]) }),
  handler: (d, { db }) => rutasRepository(db).moverChofer(d.choferId, d.id, d.dir),
  invalida: rutas,
});
export const llegadaRutaChofer = createAction({
  permiso: 'operacion.rutas:editar',
  schema: z.object({ choferId: chofer, llego: z.boolean() }),
  handler: (d, { db }) => rutasRepository(db).llegadaChofer(d.choferId, d.llego),
  invalida: rutas,
});
/** El chofer: «Llegué al destino» de su ruta en curso. */
export const llegueMiDestino = createAction({
  permiso: 'chofer.mi_carga:editar',
  schema: z.object({}),
  handler: (_d, { db }) => rutasRepository(db).llegueMiDestino(),
  invalida: rutas,
});
