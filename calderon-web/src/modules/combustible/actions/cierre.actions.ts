'use server';

import { createAction } from '@/server/actions/create-action';
import { actualizarLimitesSchema, anularCierreSchema, aprobarCierreSchema, crearBorradorSchema, guardarBorradorSchema } from '../domain/cierre.schemas';
import type { ChoferId } from '@/shared/types/dominio';
import { cierreService } from '../services/cierre.service';

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
  permiso: 'combustible.cierre_viaje:transicionar',
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
