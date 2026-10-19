import { queryOptions } from '@tanstack/react-query';
import { FRESCURA } from '@/shared/query/frescura';
import type { Db } from '@/shared/repository/types';
import type { FechaDia } from '@/shared/types/dominio';
import { operacionesRepository } from '../repositories/operaciones.repository';
import { viajesRepository } from '../repositories/viajes.repository';

/** Claves de React Query de Logística. */
export const logisticaQueries = {
  todo: () => ['logistica'] as const,
  abiertos: (db: Db) =>
    queryOptions({
      queryKey: ['logistica', 'abiertos'] as const,
      queryFn: () => viajesRepository(db).abiertos(),
      staleTime: FRESCURA.transaccional,
    }),
  opciones: (db: Db) =>
    queryOptions({
      queryKey: ['logistica', 'opciones'] as const,
      queryFn: () => viajesRepository(db).opciones(),
      staleTime: FRESCURA.maestro,
    }),
  operaciones: (db: Db, desde: FechaDia | null, hasta: FechaDia | null) =>
    queryOptions({
      queryKey: ['logistica', 'operaciones', desde, hasta] as const,
      queryFn: () => operacionesRepository(db).listar(desde, hasta),
      staleTime: FRESCURA.transaccional,
    }),
  lineas: (db: Db) =>
    queryOptions({
      queryKey: ['logistica', 'lineas'] as const,
      queryFn: () => operacionesRepository(db).lineas(),
      staleTime: FRESCURA.maestro,
    }),
  transportistas: (db: Db) =>
    queryOptions({
      queryKey: ['logistica', 'transportistas'] as const,
      queryFn: () => operacionesRepository(db).transportistas(),
      staleTime: FRESCURA.maestro,
    }),
};
