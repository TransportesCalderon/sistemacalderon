'use server';

import { createAction } from '@/server/actions/create-action';
import { cambiarUmbralesSchema, comentarAlertaSchema, reabrirAlertaSchema, resolverAlertaSchema, tomarAlertaSchema } from '../domain/alerta.schemas';
import { alertaRepository } from '../repositories/alerta.repository';

/**
 * Revisión de alertas (migración 49):
 *  - anomalias.alertas:transicionar → tomar, resolver, reabrir y comentar (la base exige Control, Adm. de combustible o TI);
 *  - anomalias.reglas:editar → cambiar umbrales (la base exige Control o TI).
 */
const rutas = () => ({ paths: ['/anomalias/alertas', '/pendientes', '/inicio'] });

export const tomarAlerta = createAction({
  permiso: 'anomalias.alertas:transicionar',
  schema: tomarAlertaSchema,
  handler: (d, { db }) => alertaRepository(db).tomar(d.alertaId),
  invalida: rutas,
});

export const resolverAlerta = createAction({
  permiso: 'anomalias.alertas:transicionar',
  schema: resolverAlertaSchema,
  handler: (d, { db }) => alertaRepository(db).resolver(d.alertaId, d.decision, d.justificacion, d.choferId, d.litros),
  invalida: rutas,
});

export const reabrirAlerta = createAction({
  permiso: 'anomalias.alertas:transicionar',
  schema: reabrirAlertaSchema,
  handler: (d, { db }) => alertaRepository(db).reabrir(d.alertaId, d.justificacion),
  invalida: rutas,
});

export const comentarAlerta = createAction({
  permiso: 'anomalias.alertas:transicionar',
  schema: comentarAlertaSchema,
  handler: (d, { db }) => alertaRepository(db).comentar(d.alertaId, d.texto),
  invalida: rutas,
});

export const cambiarUmbrales = createAction({
  permiso: 'anomalias.reglas:editar',
  schema: cambiarUmbralesSchema,
  handler: (d, { db }) => alertaRepository(db).cambiarUmbrales(d.codigo, d.parametros, d.activa),
  invalida: () => ({ paths: ['/telemetria/datos'] }),
});
