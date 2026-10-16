import { queryOptions } from '@tanstack/react-query';
import { FRESCURA } from '@/shared/query/frescura';
import type { Db } from '@/shared/repository/types';
import type { CamionId, ChoferId } from '@/shared/types/dominio';
import type { CamionListaParams } from '../domain/camion.types';
import type { ChoferListaParams } from '../domain/chofer.types';
import { camionRepository } from '../repositories/camion.repository';
import { catalogoFlotaRepository } from '../repositories/catalogo-flota.repository';
import { choferRepository } from '../repositories/chofer.repository';
import { tanqueRepository } from '../repositories/tanque.repository';

/**
 * Claves y opciones de React Query del módulo Flota (arquitectura §12).
 * El cliente Supabase se inyecta: el Server Component pasa el suyo al precargar,
 * el navegador el suyo al refrescar. Convención: [módulo, recurso, tipo, parámetros].
 */
export const camionesQueries = {
  todas: () => ['flota', 'camiones'] as const,
  listas: () => [...camionesQueries.todas(), 'lista'] as const,
  lista: (db: Db, p: CamionListaParams) =>
    queryOptions({
      queryKey: [...camionesQueries.listas(), p] as const,
      queryFn: () => camionRepository(db).listar(p),
      staleTime: FRESCURA.maestro,
    }),
  detalle: (db: Db, id: CamionId) =>
    queryOptions({
      queryKey: [...camionesQueries.todas(), 'detalle', id] as const,
      queryFn: () => camionRepository(db).obtener(id),
      staleTime: FRESCURA.maestro,
    }),
  /** Tanques del camión y su capacidad total (migración 27). */
  tanques: (db: Db, id: CamionId) =>
    queryOptions({
      queryKey: [...camionesQueries.todas(), 'tanques', id] as const,
      queryFn: () => tanqueRepository(db).delCamion(id),
      staleTime: FRESCURA.maestro,
    }),
};

export const catalogosFlotaQueries = {
  todos: () =>
    ['flota', 'catalogos'] as const,
  obtener: (db: Db) =>
    queryOptions({
      queryKey: catalogosFlotaQueries.todos(),
      queryFn: () => catalogoFlotaRepository(db).obtener(),
      staleTime: FRESCURA.catalogo,
    }),
};

export const choferesQueries = {
  todas: () => ['flota', 'choferes'] as const,
  listas: () => [...choferesQueries.todas(), 'lista'] as const,
  lista: (db: Db, p: ChoferListaParams) =>
    queryOptions({
      queryKey: [...choferesQueries.listas(), p] as const,
      queryFn: () => choferRepository(db).listar(p),
      staleTime: FRESCURA.maestro,
    }),
  detalle: (db: Db, id: ChoferId) =>
    queryOptions({
      queryKey: [...choferesQueries.todas(), 'detalle', id] as const,
      queryFn: () => choferRepository(db).obtener(id),
      staleTime: FRESCURA.maestro,
    }),
};

/** Bases operativas (mae.ubicacion tipo 'base'): cambian poco, se tratan como catálogo. */
export const basesQueries = {
  todas: () => ['flota', 'bases'] as const,
  obtener: (db: Db) =>
    queryOptions({
      queryKey: basesQueries.todas(),
      queryFn: () => catalogoFlotaRepository(db).bases(),
      staleTime: FRESCURA.catalogo,
    }),
};
