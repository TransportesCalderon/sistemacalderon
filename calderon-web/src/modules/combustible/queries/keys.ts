import { queryOptions } from '@tanstack/react-query';
import { FRESCURA } from '@/shared/query/frescura';
import type { Db } from '@/shared/repository/types';
import type { CargaId, CierreViajeId } from '@/shared/types/dominio';
import type { CargaListaParams } from '../domain/carga.types';
import type { CierreListaParams } from '../domain/cierre.types';
import type { MovimientoListaParams } from '../domain/movimiento.types';
import type { ViajeListaParams } from '../domain/viaje.types';
import { baseRepository } from '../repositories/base.repository';
import { cargaRepository } from '../repositories/carga.repository';
import { catalogoCombustibleRepository } from '../repositories/catalogo-combustible.repository';
import { cierreRepository } from '../repositories/cierre.repository';
import { movimientoRepository } from '../repositories/movimiento.repository';
import { viajeRepository } from '../repositories/viaje.repository';

/**
 * Claves y opciones de React Query del módulo Combustible (arquitectura §12).
 * Convención: [módulo, recurso, tipo, parámetros]. Una escritura en cualquier hecho
 * (carga, movimiento del camión) invalida todo ['combustible']: viajes, saldos y
 * resultados de cierre dependen de esos hechos y los recalcula la base.
 */
export const combustibleQueries = {
  todo: () => ['combustible'] as const,

  catalogos: {
    camiones: (db: Db) =>
      queryOptions({
        queryKey: ['combustible', 'catalogo', 'camiones'] as const,
        queryFn: () => catalogoCombustibleRepository(db).camiones(),
        staleTime: FRESCURA.maestro,
      }),
    estaciones: (db: Db) =>
      queryOptions({
        queryKey: ['combustible', 'catalogo', 'estaciones'] as const,
        queryFn: () => catalogoCombustibleRepository(db).estaciones(),
        staleTime: FRESCURA.maestro,
      }),
    choferes: (db: Db) =>
      queryOptions({
        queryKey: ['combustible', 'catalogo', 'choferes'] as const,
        queryFn: () => catalogoCombustibleRepository(db).choferes(),
        staleTime: FRESCURA.maestro,
      }),
    monedas: (db: Db) =>
      queryOptions({
        queryKey: ['combustible', 'catalogo', 'monedas'] as const,
        queryFn: () => catalogoCombustibleRepository(db).monedas(),
        staleTime: FRESCURA.catalogo,
      }),
  },

  cargas: {
    lista: (db: Db, p: CargaListaParams) =>
      queryOptions({
        queryKey: ['combustible', 'cargas', 'lista', p] as const,
        queryFn: () => cargaRepository(db).listar(p),
        staleTime: FRESCURA.transaccional,
      }),
    detalle: (db: Db, id: CargaId) =>
      queryOptions({
        queryKey: ['combustible', 'cargas', 'detalle', id] as const,
        queryFn: () => cargaRepository(db).obtener(id),
        staleTime: FRESCURA.transaccional,
      }),
  },

  movimientos: {
    lista: (db: Db, p: MovimientoListaParams) =>
      queryOptions({
        queryKey: ['combustible', 'movimientos', 'lista', p] as const,
        queryFn: () => movimientoRepository(db).listar(p),
        staleTime: FRESCURA.transaccional,
      }),
    tanquesBase: (db: Db) =>
      queryOptions({
        queryKey: ['combustible', 'movimientos', 'tanques-base'] as const,
        queryFn: () => movimientoRepository(db).tanquesBase(),
        staleTime: FRESCURA.maestro,
      }),
  },

  /** Base Mendoza (migraciones 24 y 30). */
  base: {
    tanques: (db: Db) =>
      queryOptions({
        queryKey: ['combustible', 'base', 'tanques'] as const,
        queryFn: () => baseRepository(db).tanques(),
        staleTime: FRESCURA.transaccional,
      }),
    controles: (db: Db, depositoId: number) =>
      queryOptions({
        queryKey: ['combustible', 'base', 'controles', depositoId] as const,
        queryFn: () => baseRepository(db).controles(depositoId),
        staleTime: FRESCURA.transaccional,
      }),
    libro: (db: Db, depositoId: number, pagina: number) =>
      queryOptions({
        queryKey: ['combustible', 'base', 'libro', depositoId, pagina] as const,
        queryFn: () => baseRepository(db).libro(depositoId, pagina),
        staleTime: FRESCURA.transaccional,
      }),
    responsables: (db: Db, depositoId: number) =>
      queryOptions({
        queryKey: ['combustible', 'base', 'responsables', depositoId] as const,
        queryFn: () => baseRepository(db).responsables(depositoId),
        staleTime: FRESCURA.transaccional,
      }),
    usuarios: (db: Db) =>
      queryOptions({
        queryKey: ['combustible', 'base', 'usuarios'] as const,
        queryFn: () => baseRepository(db).usuarios(),
        staleTime: FRESCURA.maestro,
      }),
    tiposCombustible: (db: Db) =>
      queryOptions({
        queryKey: ['combustible', 'base', 'tipos-combustible'] as const,
        queryFn: () => baseRepository(db).tiposCombustible(),
        staleTime: FRESCURA.catalogo,
      }),
    /** Vista previa del segmento (fue.fn_resultado_control_base). Siempre fresca. */
    segmento: (db: Db, controlId: number) =>
      queryOptions({
        queryKey: ['combustible', 'base', 'segmento', controlId] as const,
        queryFn: () => baseRepository(db).segmento(controlId),
        staleTime: 0,
      }),
    verificacion: (db: Db, aprobacionId: number) =>
      queryOptions({
        queryKey: ['combustible', 'base', 'verificacion', aprobacionId] as const,
        queryFn: () => baseRepository(db).verificar(aprobacionId),
        staleTime: 0,
      }),
  },

  viajes: {
    lista: (db: Db, p: ViajeListaParams) =>
      queryOptions({
        queryKey: ['combustible', 'viajes', 'lista', p] as const,
        queryFn: () => viajeRepository(db).listar(p),
        staleTime: FRESCURA.transaccional,
      }),
  },

  cierres: {
    lista: (db: Db, p: CierreListaParams) =>
      queryOptions({
        queryKey: ['combustible', 'cierres', 'lista', p] as const,
        queryFn: () => cierreRepository(db).listar(p),
        staleTime: FRESCURA.transaccional,
      }),
    detalle: (db: Db, id: CierreViajeId) =>
      queryOptions({
        queryKey: ['combustible', 'cierres', 'detalle', id] as const,
        queryFn: () => cierreRepository(db).obtener(id),
        staleTime: FRESCURA.transaccional,
      }),
    /** Resultado en vivo del borrador (fue.fn_resultado_cierre). */
    resultado: (db: Db, id: CierreViajeId) =>
      queryOptions({
        queryKey: ['combustible', 'cierres', 'resultado', id] as const,
        queryFn: () => cierreRepository(db).resultado(id),
        staleTime: FRESCURA.transaccional,
      }),
    /** Verificación desde los hechos (fue.fn_verificar_cierre). Siempre fresca. */
    verificacion: (db: Db, id: CierreViajeId) =>
      queryOptions({
        queryKey: ['combustible', 'cierres', 'verificacion', id] as const,
        queryFn: () => cierreRepository(db).verificar(id),
        staleTime: 0,
      }),
  },
};
