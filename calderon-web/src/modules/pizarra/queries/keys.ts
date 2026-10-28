import { queryOptions } from '@tanstack/react-query';
import { FRESCURA } from '@/shared/query/frescura';
import type { Db } from '@/shared/repository/types';
import { pizarraRepository } from '../repositories/pizarra.repository';

/** Claves de React Query de la Pizarra Azul. Todo cuelga de ['pizarra']: un aviso de tiempo real lo refresca entero. */
export const pizarraQueries = {
  todo: () => ['pizarra'] as const,
  filas: (db: Db) =>
    queryOptions({
      queryKey: ['pizarra', 'filas'] as const,
      queryFn: () => pizarraRepository(db).filas(),
      staleTime: FRESCURA.transaccional,
    }),
  columnas: (db: Db) =>
    queryOptions({
      queryKey: ['pizarra', 'columnas'] as const,
      queryFn: () => pizarraRepository(db).columnasAccesorio(),
      staleTime: FRESCURA.transaccional,
    }),
  lugares: (db: Db) =>
    queryOptions({
      queryKey: ['pizarra', 'lugares'] as const,
      queryFn: () => pizarraRepository(db).lugares(),
      staleTime: FRESCURA.maestro,
    }),
  semis: (db: Db) =>
    queryOptions({ queryKey: ['pizarra', 'semis'] as const, queryFn: () => pizarraRepository(db).semis(), staleTime: FRESCURA.maestro }),
  tipos: (db: Db) =>
    queryOptions({
      queryKey: ['pizarra', 'tipos-accesorio'] as const,
      queryFn: () => pizarraRepository(db).tiposAccesorio(),
      staleTime: FRESCURA.maestro,
    }),
  gensets: (db: Db) =>
    queryOptions({
      queryKey: ['pizarra', 'gensets'] as const,
      queryFn: () => pizarraRepository(db).gensets(),
      // Siempre al día al abrir una lista: un genset recién cargado (o cargado por otro usuario) tiene que aparecer
      staleTime: 0,
    }),
};
