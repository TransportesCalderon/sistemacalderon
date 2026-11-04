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
  /** Migración 161: tabla de choferes y la fila de rutas de cada uno. */
  rutasChoferes: (db: Db) =>
    queryOptions({
      queryKey: ['logistica', 'rutas', 'choferes'] as const,
      queryFn: () => rutasRepository(db).choferes(),
      staleTime: FRESCURA.transaccional,
    }),
  rutasDeChofer: (db: Db, chofer: number) =>
    queryOptions({
      queryKey: ['logistica', 'rutas', 'chofer', chofer] as const,
      queryFn: () => rutasRepository(db).deChofer(chofer),
      staleTime: FRESCURA.transaccional,
    }),
  /** Migración 158: todas las rutas de una operación. */
  rutasTramo: (db: Db, servicio: number) =>
    queryOptions({
      queryKey: ['logistica', 'rutas', 'tramos', servicio] as const,
      queryFn: () => rutasRepository(db).todas(servicio),
      staleTime: FRESCURA.transaccional,
    }),
  /** Migración 156: pantalla «Rutas para choferes» y avisos de desvío. */
  rutasOperaciones: (db: Db) =>
    queryOptions({
      queryKey: ['logistica', 'rutas', 'lista'] as const,
      queryFn: () => rutasRepository(db).operaciones(),
      staleTime: FRESCURA.transaccional,
    }),
  avisosDesvio: (db: Db) =>
    queryOptions({
      queryKey: ['logistica', 'rutas', 'avisos'] as const,
      queryFn: () => rutasRepository(db).avisosDesvio(),
      staleTime: 0,
    }),
  avisosTanqueBajo: (db: Db) =>
    queryOptions({
      queryKey: ['logistica', 'tanque_bajo'] as const,
      queryFn: () => rutasRepository(db).avisosTanqueBajo(),
      staleTime: 0,
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
  /** Migración 166: precio del viaje cargado. */
  precioOperacion: (db: Db, servicio: number) =>
    queryOptions({
      queryKey: ['logistica', 'operacion', servicio, 'precio'] as const,
      queryFn: () => operacionesRepository(db).precio(servicio),
      staleTime: 0,
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
  /** Migración 137: agentes de transporte. */
  agentes: (db: Db, todos: boolean) =>
    queryOptions({
      queryKey: ['logistica', 'agentes', todos] as const,
      queryFn: () => operacionesRepository(db).agentes(todos),
      staleTime: FRESCURA.maestro,
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
