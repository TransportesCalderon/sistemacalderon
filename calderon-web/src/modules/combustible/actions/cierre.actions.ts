'use server';

import { z } from 'zod';
import { createAction } from '@/server/actions/create-action';
import { actualizarLimitesSchema, anularCierreSchema, aprobarCierreSchema, crearBorradorSchema, guardarBorradorSchema } from '../domain/cierre.schemas';
import type { ChoferId } from '@/shared/types/dominio';
import { cierreService } from '../services/cierre.service';
import { cierreRepository } from '../repositories/cierre.repository';

/**
 * Server actions del cierre de viaje (fila combustible.cierre_viaje):
 *  - editar: crear y completar el borrador;
 *  - transicionar: aprobar (fue.fn_aprobar_cierre) y anular (fue.fn_anular_cierre).
 * La verificación es una lectura (fue.fn_verificar_cierre): no es una acción.
 */
const rutas = (id: number) => ({ paths: ['/combustible/viajes', '/combustible/cierres', `/combustible/cierres/${id}`] });

export const crearBorradorCierre = createAction({
  permiso: 'combustible.cierre_viaje:editar',
  schema: crearBorradorSchema,
  handler: ({ camionId, cargaSalidaId }, { db }) => cierreService(db).crearBorrador(camionId, cargaSalidaId),
  invalida: (_d, id) => rutas(id),
});

export const guardarBorradorCierre = createAction({
  permiso: 'combustible.cierre_viaje:editar',
  schema: guardarBorradorSchema,
  handler: ({ id, versionFila, ...datos }, { db }) =>
    cierreService(db).guardar(id, versionFila, { ...datos, choferResponsableId: datos.choferResponsableId as ChoferId | null }),
  invalida: ({ id }) => rutas(id),
});

export const actualizarLimitesCierre = createAction({
  permiso: 'combustible.cierre_viaje:editar',
  schema: actualizarLimitesSchema,
  handler: ({ id, versionFila }, { db }) => cierreService(db).actualizarLimites(id, versionFila),
  invalida: ({ id }) => rutas(id),
});

export const aprobarCierre = createAction({
  // Migración 170: quién aprueba lo decide la base (autorizados por TI, nunca quien lo preparó)
  permiso: 'combustible.cierre_viaje:ver',
  schema: aprobarCierreSchema,
  handler: ({ id, versionFila }, { db }) => cierreService(db).aprobar(id, versionFila),
  invalida: ({ id }) => rutas(id),
});

export const anularCierre = createAction({
  permiso: 'combustible.cierre_viaje:transicionar',
  schema: anularCierreSchema,
  handler: ({ id, versionFila, motivo }, { db }) => cierreService(db).anular(id, versionFila, motivo),
  invalida: ({ id }) => rutas(id),
});

/**
 * Migración 185: decidir descontar o justificar la diferencia, y pedir / resolver quitar un descuento
 * aprobado. Quién puede y las reglas (motivo, evidencia, otra persona) las controla la base.
 */
const textoN = z.string().max(2000).nullable();
export const decidirDiferencia = createAction({
  permiso: 'combustible.cierre_viaje:ver',
  schema: z.object({ cierreId: z.number().int().positive(), decision: z.enum(['descontar', 'justificar']).nullable(), motivo: textoN, evidencia: textoN }),
  handler: (d, { db }) => cierreRepository(db).decidir(d),
  invalida: (d) => rutas(d.cierreId),
});
export const pedirQuitarDescuento = createAction({
  permiso: 'combustible.cierre_viaje:ver',
  schema: z.object({ cierreId: z.number().int().positive(), motivo: z.string().max(2000), evidencia: z.string().max(2000) }),
  handler: (d, { db }) => cierreRepository(db).pedirQuitarDescuento(d),
  invalida: (d) => rutas(d.cierreId),
});
export const resolverQuitarDescuento = createAction({
  permiso: 'combustible.cierre_viaje:ver',
  schema: z.object({ cierreId: z.number().int().positive(), pedidoId: z.number().int().positive(), aprobar: z.boolean(), motivo: textoN }),
  handler: (d, { db }) => cierreRepository(db).resolverQuitarDescuento(d),
  invalida: (d) => rutas(d.cierreId),
});
export const retirarQuitarDescuento = createAction({
  permiso: 'combustible.cierre_viaje:ver',
  schema: z.object({ cierreId: z.number().int().positive(), pedidoId: z.number().int().positive() }),
  handler: (d, { db }) => cierreRepository(db).retirarQuitarDescuento(d.pedidoId),
  invalida: (d) => rutas(d.cierreId),
});
