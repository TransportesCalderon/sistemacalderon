import { queryOptions } from '@tanstack/react-query';
import { FRESCURA } from '@/shared/query/frescura';
import type { Db } from '@/shared/repository/types';
import type { CamionId } from '@/shared/types/dominio';
import type { CamionListaParams } from '../domain/camion.types';
import { camionRepository } from '../repositories/camion.repository';
import { catalogoFlotaRepository } from '../repositories/catalogo-flota.repository';

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
