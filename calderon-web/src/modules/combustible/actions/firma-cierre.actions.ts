'use server';

import { z } from 'zod';
import { createAction } from '@/server/actions/create-action';

/**
 * Migración 256 · Escaneo del acta del cierre firmada por el chofer. La base controla quién lo sube, que el cierre esté
 * aprobado y el tipo de archivo. Devuelve el archivo anterior (si se reemplazó) para borrarlo del Storage.
 */
export const subirFirmaCierre = createAction({
  permiso: 'combustible.cierre_viaje:ver',
  schema: z.object({
    cierreId: z.number().int().positive(),
    ruta: z.string().min(3).max(300),
    nombre: z.string().max(200).nullable(),
  }),
  handler: async ({ cierreId, ruta, nombre }, { db }) => {
    const { data, error } = await db.schema('fue').rpc('fn_subir_firma_cierre', { p_cierre: cierreId, p_ruta: ruta, p_nombre: nombre });
    if (error) throw error;
    return { anterior: typeof data === 'string' ? data : null };
  },
});
