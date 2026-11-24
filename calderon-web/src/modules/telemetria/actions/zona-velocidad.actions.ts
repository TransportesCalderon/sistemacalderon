'use server';

import { createAction } from '@/server/actions/create-action';
import { estadoZonaSchema, guardarZonaSchema } from '../domain/zona-velocidad';

/** Migración 307 · Los tramos de velocidad de montaña. La base decide quién puede (Telemetría, Gerencia, TI). */
export const guardarZonaVelocidad = createAction({
  permiso: 'anomalias.reglas:editar',
  schema: guardarZonaSchema,
  handler: async (d, { db }) => {
    const { data, error } = await db.schema('tel').rpc('fn_guardar_zona_velocidad', {
      p_id: d.id,
      p_datos: {
        nombre: d.nombre,
        sentido: d.sentido,
        velocidad_max: d.velocidadMax,
        ancho_m: d.anchoM,
        orden: d.orden,
        observacion: d.observacion,
        puntos: d.puntos,
      },
    });
    if (error) throw error;
    return data as { id?: number; armado_con?: string; error?: string; error_mapa?: string } | null;
  },
});

export const cambiarEstadoZona = createAction({
  permiso: 'anomalias.reglas:editar',
  schema: estadoZonaSchema,
  handler: async (d, { db }) => {
    const { error } = await db.schema('tel').rpc('fn_estado_zona_velocidad', { p_id: d.id, p_estado: d.estado });
    if (error) throw error;
    return null;
  },
});
