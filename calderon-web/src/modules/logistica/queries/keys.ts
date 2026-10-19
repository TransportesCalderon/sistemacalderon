import { queryOptions } from '@tanstack/react-query';
import { FRESCURA } from '@/shared/query/frescura';
import type { Db } from '@/shared/repository/types';
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
};
