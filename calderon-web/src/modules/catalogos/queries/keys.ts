import { queryOptions } from '@tanstack/react-query';
import { FRESCURA } from '@/shared/query/frescura';
import type { Db } from '@/shared/repository/types';
import { catalogosRepository } from '../repositories/catalogos.repository';

/** Claves de React Query de los catálogos. */
export const catalogosQueries = {
  todo: () => ['catalogos'] as const,
  paises: (db: Db) => queryOptions({ queryKey: ['catalogos', 'paises'] as const, queryFn: () => catalogosRepository(db).paises(), staleTime: FRESCURA.catalogo }),
  monedas: (db: Db) => queryOptions({ queryKey: ['catalogos', 'monedas'] as const, queryFn: () => catalogosRepository(db).monedas(), staleTime: FRESCURA.catalogo }),
  proveedores: (db: Db) =>
    queryOptions({ queryKey: ['catalogos', 'proveedores'] as const, queryFn: () => catalogosRepository(db).proveedores(), staleTime: FRESCURA.maestro }),
  estaciones: (db: Db) =>
    queryOptions({ queryKey: ['catalogos', 'estaciones'] as const, queryFn: () => catalogosRepository(db).estaciones(), staleTime: FRESCURA.maestro }),
  tiposCambio: (db: Db, moneda?: string) =>
    queryOptions({
      queryKey: ['catalogos', 'tipos-cambio', moneda ?? ''] as const,
      queryFn: () => catalogosRepository(db).tiposCambio(moneda ? { moneda } : {}),
      staleTime: FRESCURA.maestro,
    }),
  ubicaciones: (db: Db) =>
    queryOptions({ queryKey: ['catalogos', 'ubicaciones'] as const, queryFn: () => catalogosRepository(db).ubicaciones(), staleTime: FRESCURA.maestro }),
  importaciones: (db: Db) =>
    queryOptions({ queryKey: ['catalogos', 'importaciones'] as const, queryFn: () => catalogosRepository(db).importaciones(), staleTime: FRESCURA.maestro }),
  // Migración 121: lo leen los formularios de operación, tarifa y cotización
  tiposCarga: (db: Db) =>
    queryOptions({ queryKey: ['catalogos', 'tipos-carga'] as const, queryFn: () => catalogosRepository(db).tiposCarga(), staleTime: FRESCURA.maestro }),
  parametros: (db: Db) =>
    queryOptions({ queryKey: ['catalogos', 'parametros'] as const, queryFn: () => catalogosRepository(db).parametros(), staleTime: FRESCURA.maestro }),
};
