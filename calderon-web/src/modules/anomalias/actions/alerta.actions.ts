'use server';

import { createAction } from '@/server/actions/create-action';
import {
  avanceAlertaSchema,
  cambiarResponsableSchema,
  cambiarUmbralesSchema,
  comentarAlertaSchema,
  escalamientoVistoSchema,
  pedirProrrogaSchema,
  reabrirAlertaSchema,
  reasignarAlertaSchema,
  resolverAlertaSchema,
  resolverProrrogaSchema,
  tomarAlertaSchema,
} from '../domain/alerta.schemas';
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

/**
 * Migración 189 · Gestión de alertas. Quién puede cada cosa lo decide la base:
 *  - avance y reasignar: Telemetría, Adm. de combustible, TI o quien recibe escalamientos;
 *  - pedir prórroga: solo el responsable;
 *  - resolver prórroga y «visto» de la ventana: quien recibe escalamientos (Gerencia, por defecto);
 *  - responsables por tipo: TI o Gerencia.
 * Por eso acá se pide solo poder entrar (Gerencia puede no tener la bandeja de alertas).
 */
const ENTRA = ['anomalias.alertas:transicionar', 'anomalias.alertas:ver', 'inicio.dashboard:ver'] as const;

export const avanceAlerta = createAction({
  permiso: ENTRA,
  schema: avanceAlertaSchema,
  handler: (d, { db }) => alertaRepository(db).avance(d.alertaId, d.hecho, d.falta?.trim() || null),
  invalida: rutas,
});

export const reasignarAlerta = createAction({
  permiso: ENTRA,
  schema: reasignarAlertaSchema,
  handler: (d, { db }) => alertaRepository(db).reasignar(d.alertaId, d.rol, d.usuarioId, d.motivo),
  invalida: rutas,
});

export const pedirProrrogaAlerta = createAction({
  permiso: 'anomalias.alertas:transicionar',
  schema: pedirProrrogaSchema,
  handler: (d, { db }) => alertaRepository(db).pedirProrroga(d.alertaId, d.horas, d.motivo),
  invalida: rutas,
});

export const resolverProrrogaAlerta = createAction({
  permiso: ENTRA,
  schema: resolverProrrogaSchema,
  handler: (d, { db }) => alertaRepository(db).resolverProrroga(d.prorrogaId, d.aprobar, d.motivo?.trim() || null),
  invalida: rutas,
});

export const marcarEscalamientoVisto = createAction({
  permiso: ENTRA,
  schema: escalamientoVistoSchema,
  handler: (d, { db }) => alertaRepository(db).escalamientoVisto(d.alertaId),
});

export const cambiarResponsableAlerta = createAction({
  permiso: ['anomalias.reglas:editar', 'inicio.dashboard:ver'],
  schema: cambiarResponsableSchema,
  handler: (d, { db }) => alertaRepository(db).cambiarResponsable(d.codigo, d.rol, d.usuarioId),
  invalida: rutas,
});
