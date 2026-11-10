'use server';

import { z } from 'zod';
import { createAction } from '@/server/actions/create-action';
import { consumoAprendidoRepository } from '../repositories/consumo-aprendido.repository';

/** Migración 223: choferes con consumo alto. Quién puede lo vuelve a controlar la base (Telemetría, Gerencia, Adm. combustible, TI). */
const mes = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Mes inválido');
const chofer = z.number().int().positive();

export const recalcularConsumoChoferes = createAction({
  permiso: 'telemetria.sesiones:ver',
  schema: z.object({ mes }),
  handler: (d, { db }) => consumoAprendidoRepository(db).recalcular(d.mes),
});

export const revisarConsumoChofer = createAction({
  permiso: 'telemetria.sesiones:ver',
  schema: z.object({ mes, chofer, comentario: z.string().max(1000) }),
  handler: (d, { db }) => consumoAprendidoRepository(db).revisar(d.mes, d.chofer, d.comentario),
});

export const analizarConsumoChofer = createAction({
  permiso: 'telemetria.sesiones:ver',
  schema: z.object({ mes, chofer }),
  handler: (d, { db }) => consumoAprendidoRepository(db).analizar(d.mes, d.chofer),
});
