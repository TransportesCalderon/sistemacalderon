'use server';

import { createAction } from '@/server/actions/create-action';
import { ajustarPlanSchema, cerrarPartidaSchema, partidaCajaSchema } from '../domain/plan-caja';
import { planCajaRepository } from '../repositories/plan-caja.repository';

/**
 * Migración 367 · Planificador de caja. Lo cambian Finanzas, Gerencia o TI: lo decide la base (fin.fn_exigir_plan_caja).
 * Por eso alcanza con poder ver Cobros y pagos: Gerencia ve Finanzas pero no la edita, y el plan sí lo tiene que poder mover.
 */
const RUTAS = { paths: ['/analisis/cobros-pagos', '/finanzas'] };

export const ajustarPlanCaja = createAction({
  permiso: 'finanzas.cobros_pagos:ver',
  schema: ajustarPlanSchema,
  handler: (d, { db }) => planCajaRepository(db).ajustar(d),
  invalida: () => RUTAS,
});

export const guardarPartidaCaja = createAction({
  permiso: 'finanzas.cobros_pagos:ver',
  schema: partidaCajaSchema,
  handler: (d, { db }) => planCajaRepository(db).guardarPartida(d),
  invalida: () => RUTAS,
});

export const cerrarPartidaCaja = createAction({
  permiso: 'finanzas.cobros_pagos:ver',
  schema: cerrarPartidaSchema,
  handler: (d, { db }) => planCajaRepository(db).cerrarPartida(d),
  invalida: () => RUTAS,
});
