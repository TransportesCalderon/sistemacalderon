import { queryOptions } from '@tanstack/react-query';
import { FRESCURA } from '@/shared/query/frescura';
import type { Db } from '@/shared/repository/types';
import type { FechaDia } from '@/shared/types/dominio';
import { operacionesRepository } from '../repositories/operaciones.repository';
import { viajesRepository } from '../repositories/viajes.repository';
import { viajesChoferRepository } from '../repositories/viajes-chofer.repository';
import { rutasRepository } from '../repositories/rutas.repository';

/** Claves de React Query de Logística. */
export const logisticaQueries = {
  todo: () => ['logistica'] as const,
  /** Migración 136: la ruta para el chofer de una operación. */
  rutaOperacion: (db: Db, servicio: number) =>
    queryOptions({
      queryKey: ['logistica', 'rutas', 'operacion', servicio] as const,
      queryFn: () => rutasRepository(db).deOperacion(servicio),
      staleTime: FRESCURA.transaccional,
    }),
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
  /** Una operación para su ficha en el panel (migración 114). */
  operacion: (db: Db, servicio: number) =>
    queryOptions({
      queryKey: ['logistica', 'operacion', servicio] as const,
      queryFn: () => operacionesRepository(db).obtener(servicio),
      staleTime: FRESCURA.transaccional,
    }),
  tramos: (db: Db, servicio: number) =>
    queryOptions({
      queryKey: ['logistica', 'tramos', servicio] as const,
      queryFn: () => operacionesRepository(db).tramos(servicio),
    }),
  sugerencia: (db: Db, cliente: number) =>
    queryOptions({
      queryKey: ['logistica', 'sugerencia', cliente] as const,
      queryFn: () => operacionesRepository(db).sugerencia(cliente),
      staleTime: FRESCURA.transaccional,
    }),
  lineas: (db: Db) =>
    queryOptions({
      queryKey: ['logistica', 'lineas'] as const,
      queryFn: () => operacionesRepository(db).lineas(),
      staleTime: FRESCURA.maestro,
    }),
  tractores: (db: Db) =>
    queryOptions({
      queryKey: ['logistica', 'tractores'] as const,
      queryFn: () => viajesChoferRepository(db).tractores(),
      staleTime: FRESCURA.transaccional,
    }),
  viajesChofer: (db: Db, desde: FechaDia | null, hasta: FechaDia | null) =>
    queryOptions({
      queryKey: ['logistica', 'viajes-chofer', desde, hasta] as const,
      queryFn: () => viajesChoferRepository(db).viajes(desde, hasta),
      staleTime: FRESCURA.transaccional,
    }),
  viajeChofer: (db: Db, id: number) =>
    queryOptions({
      queryKey: ['logistica', 'viaje-chofer', id] as const,
      queryFn: () => viajesChoferRepository(db).viaje(id),
      staleTime: FRESCURA.transaccional,
    }),
  transportistas: (db: Db) =>
    queryOptions({
      queryKey: ['logistica', 'transportistas'] as const,
      queryFn: () => operacionesRepository(db).transportistas(),
      staleTime: FRESCURA.maestro,
    }),
};
