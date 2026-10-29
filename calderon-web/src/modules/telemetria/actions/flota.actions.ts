'use server';

import { z } from 'zod';
import { createAction } from '@/server/actions/create-action';
import { flotaRepository } from '../repositories/flota.repository';

/** Importar ahora todas las marcas (lo mismo que hacen las tareas programadas cada 10 minutos). Solo TI: la base lo permite a tc_admin. */
export const importarTelemetriaAhora = createAction({
  permiso: 'configuracion.catalogos:editar',
  schema: z.object({}),
  handler: (_d, { db }) => flotaRepository(db).importarAhora(),
  invalida: () => ({ paths: ['/pizarra'] }),
});
