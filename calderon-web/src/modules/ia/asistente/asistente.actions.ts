'use server';

import { z } from 'zod';
import { createAction } from '@/server/actions/create-action';
import { asistenteRepository } from './asistente';

/** IA-3: preguntar y valorar. La base vuelve a exigir Gerencia o usuario de prueba, y los topes. */
export const preguntarAsistente = createAction({
  permiso: 'ia.asistente:editar',
  schema: z.object({ pregunta: z.string().nullable(), conversacionId: z.number().int().positive().nullable(), sugerida: z.string().nullable() }),
  handler: (d, { db }) => asistenteRepository(db).preguntar(d.pregunta, d.conversacionId, d.sugerida),
});

export const valorarRespuesta = createAction({
  permiso: 'ia.asistente:editar',
  schema: z.object({ turno: z.number().int().positive(), util: z.boolean(), comentario: z.string().nullable() }),
  handler: (d, { db }) => asistenteRepository(db).valorar(d.turno, d.util, d.comentario),
});

/** IA-4: armar (o volver a armar) el informe de una semana. La base exige Gerencia o TI. */
export const generarInforme = createAction({
  permiso: 'ia.asistente:editar',
  schema: z.object({ desde: z.string().nullable() }),
  handler: (d, { db }) => asistenteRepository(db).generarInforme(d.desde),
});
