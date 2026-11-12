'use server';

import { z } from 'zod';
import { createAction } from '@/server/actions/create-action';

/** Migración 257 · Administración marca revisado un intento de cargar un comprobante repetido (con una nota). */
export const revisarIntentoRepetido = createAction({
  permiso: 'rrhh.fondos:transicionar',
  schema: z.object({ intentoId: z.number().int().positive(), nota: z.string().max(500).nullable() }),
  handler: async (d, { db }) => {
    const { error } = await db.schema('fin').rpc('fn_revisar_intento_repetido', { p_intento: d.intentoId, p_nota: d.nota });
    if (error) throw error;
    return null;
  },
});
