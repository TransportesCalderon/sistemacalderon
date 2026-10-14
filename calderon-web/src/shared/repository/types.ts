import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/shared/types/db';

/**
 * Contratos comunes de los repositorios (arquitectura §8).
 * Un repositorio recibe el cliente Supabase por parámetro: el mismo código corre con el
 * cliente del servidor (precarga en Server Components, server actions) y con el del
 * navegador (React Query).
 */
export type Db = SupabaseClient<Database>;

export interface Pagina<T> {
  filas: T[];
  total: number | null;
}

export interface Orden<C extends string> {
  campo: C;
  dir: 'asc' | 'desc';
}

export interface ListaParams<F, C extends string> {
  filtros: F;
  orden?: Orden<C>;
  pagina?: number;
  tamano?: number;
  incluirEliminados?: boolean;
}

/** Toda escritura de una fila versionada exige la versión leída (concurrencia optimista). */
export interface Versionado {
  id: number;
  versionFila: number;
}

/** Error de PostgREST / PostgreSQL. Expone `code` (SQLSTATE) para server/errors/traducir. */
export class RepoError extends Error {
  readonly code: string;
  constructor(public readonly pg: PostgrestError) {
    super(pg.message);
    this.name = 'RepoError';
    this.code = pg.code;
  }
}

/**
 * El update filtró por version_fila y no afectó filas: otro usuario guardó antes.
 * Usa el mismo SQLSTATE que el trigger aud.fn_columnas_control (40001).
 */
export class ConflictoVersion extends Error {
  readonly code = '40001';
  constructor(tabla: string, id: number) {
    super(`Conflicto de concurrencia en ${tabla} id=${id}`);
    this.name = 'ConflictoVersion';
  }
}

/** Calcula el rango [desde, hasta] de PostgREST para una página (1-based). */
export function rangoPagina(pagina = 1, tamano = 50): [number, number] {
  const p = Math.max(1, Math.floor(pagina));
  const t = Math.min(200, Math.max(1, Math.floor(tamano)));
  const desde = (p - 1) * t;
  return [desde, desde + t - 1];
}

/**
 * Deja un texto de búsqueda apto para un filtro `or=(...ilike...)` de PostgREST:
 * solo letras, números, espacio, guion y punto (las comas, paréntesis y comodines
 * romperían la sintaxis del filtro).
 */
export function textoBusqueda(texto: string | undefined | null): string | null {
  const limpio = (texto ?? '')
    .normalize('NFC')
    .replace(/[^\p{L}\p{N} .-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  return limpio.length > 0 ? limpio : null;
}
