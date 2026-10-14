import { queryOptions } from '@tanstack/react-query';
import { FRESCURA } from '@/shared/query/frescura';
import type { Db } from '@/shared/repository/types';
import type { ClienteId } from '@/shared/types/dominio';
import type { ClienteListaParams } from '../domain/cliente.types';
import { catalogoComercialRepository } from '../repositories/catalogo-comercial.repository';
import { clienteRepository } from '../repositories/cliente.repository';

/**
 * Claves y opciones de React Query del módulo Comercial (arquitectura §12).
 * El cliente Supabase se inyecta: el Server Component pasa el suyo al precargar,
 * el navegador el suyo al refrescar. Convención: [módulo, recurso, tipo, parámetros].
 */
export const clientesQueries = {
  todas: () => ['comercial', 'clientes'] as const,
  listas: () => [...clientesQueries.todas(), 'lista'] as const,
  lista: (db: Db, p: ClienteListaParams) =>
    queryOptions({
      queryKey: [...clientesQueries.listas(), p] as const,
      queryFn: () => clienteRepository(db).listar(p),
      staleTime: FRESCURA.maestro,
    }),
  detalle: (db: Db, id: ClienteId) =>
    queryOptions({
      queryKey: [...clientesQueries.todas(), 'detalle', id] as const,
      queryFn: () => clienteRepository(db).obtener(id),
      staleTime: FRESCURA.maestro,
    }),
  parecidos: (db: Db, razonSocial: string, excluirId?: ClienteId) =>
    queryOptions({
      queryKey: [...clientesQueries.todas(), 'parecidos', razonSocial, excluirId ?? null] as const,
      queryFn: () => clienteRepository(db).parecidos(razonSocial, excluirId),
      staleTime: FRESCURA.transaccional,
    }),
  segmentos: (db: Db) =>
    queryOptions({
      queryKey: [...clientesQueries.todas(), 'segmentos'] as const,
      queryFn: () => clienteRepository(db).segmentos(),
      staleTime: FRESCURA.maestro,
    }),
};

export const catalogosComercialQueries = {
  todos: () => ['comercial', 'catalogos'] as const,
  obtener: (db: Db) =>
    queryOptions({
      queryKey: catalogosComercialQueries.todos(),
      queryFn: () => catalogoComercialRepository(db).obtener(),
      staleTime: FRESCURA.catalogo,
    }),
};
