'use server';

import { z } from 'zod';
import { createAction } from '@/server/actions/create-action';
import { flotaRepository } from '../repositories/flota.repository';

/** Importar ahora (lo mismo que hace la tarea programada cada 10 minutos). Solo TI: la base lo permite a tc_admin. */
export const importarTelemetriaAhora = createAction({
  permiso: 'configuracion.catalogos:editar',
  schema: z.object({ marca: z.enum(['renault', 'volvo']) }),
  handler: ({ marca }, { db }) => flotaRepository(db).importarAhora(marca),
  invalida: () => ({ paths: ['/telemetria/mapa'] }),
});
