import { queryOptions } from '@tanstack/react-query';
import { FRESCURA } from '@/shared/query/frescura';
import type { Db } from '@/shared/repository/types';
import { flotaRepository } from '../repositories/flota.repository';

/** Claves de React Query del módulo Telemetría. */
export const telemetriaQueries = {
  todo: () => ['telemetria'] as const,
  enVivo: (db: Db) =>
    queryOptions({
      queryKey: ['telemetria', 'en-vivo'] as const,
      queryFn: () => flotaRepository(db).enVivo(),
      staleTime: FRESCURA.telemetriaVivo,
    }),
  vehiculosApi: (db: Db) =>
    queryOptions({
      queryKey: ['telemetria', 'vehiculos-api'] as const,
      queryFn: () => flotaRepository(db).vehiculosApi(),
      staleTime: FRESCURA.maestro,
    }),
  corridas: (db: Db) =>
    queryOptions({
      queryKey: ['telemetria', 'corridas'] as const,
      queryFn: () => flotaRepository(db).corridas(),
      staleTime: FRESCURA.telemetriaVivo,
    }),
};
