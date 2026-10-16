import { queryOptions } from '@tanstack/react-query';
import { FRESCURA } from '@/shared/query/frescura';
import type { Db } from '@/shared/repository/types';
import type { CargaId, CierreViajeId } from '@/shared/types/dominio';
import type { CargaListaParams } from '../domain/carga.types';
import type { CierreListaParams } from '../domain/cierre.types';
import type { ViajeListaParams } from '../domain/viaje.types';
import { cargaRepository } from '../repositories/carga.repository';
import { catalogoCombustibleRepository } from '../repositories/catalogo-combustible.repository';
import { cierreRepository } from '../repositories/cierre.repository';
import { mochilaRepository } from '../repositories/mochila.repository';
import { viajeRepository } from '../repositories/viaje.repository';

/**
 * Claves y opciones de React Query del módulo Combustible (arquitectura §12).
 * Convención: [módulo, recurso, tipo, parámetros]. Una escritura en cualquier hecho
 * (carga, control, movimiento) invalida todo ['combustible']: viajes, saldos y
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
    paradas: (db: Db, camionId: number, soloFronteras: boolean) =>
      queryOptions({
        queryKey: ['combustible', 'cargas', 'paradas', camionId, soloFronteras] as const,
        queryFn: () => cargaRepository(db).paradas(camionId, soloFronteras),
        staleTime: FRESCURA.transaccional,
      }),
  },

  mochilas: {
    camiones: (db: Db) =>
      queryOptions({
        queryKey: ['combustible', 'mochilas', 'camiones'] as const,
        queryFn: () => mochilaRepository(db).camiones(),
        staleTime: FRESCURA.transaccional,
      }),
    usos: (db: Db, camionId: number) =>
      queryOptions({
        queryKey: ['combustible', 'mochilas', 'usos', camionId] as const,
        queryFn: () => mochilaRepository(db).usos(camionId),
        staleTime: FRESCURA.transaccional,
      }),
    historial: (db: Db, camionId: number) =>
      queryOptions({
        queryKey: ['combustible', 'mochilas', 'historial', camionId] as const,
        queryFn: () => mochilaRepository(db).mochilas(camionId),
        staleTime: FRESCURA.transaccional,
      }),
    controles: (db: Db, depositoId: number) =>
      queryOptions({
        queryKey: ['combustible', 'mochilas', 'controles', depositoId] as const,
        queryFn: () => mochilaRepository(db).controles(depositoId),
        staleTime: FRESCURA.transaccional,
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
