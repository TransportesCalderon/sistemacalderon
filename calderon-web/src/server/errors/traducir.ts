import type { ErrorAccion } from '@/server/actions/result';

interface ErrorConCodigo {
  code?: string;
  message?: string;
}

/**
 * Traduce un error de PostgREST / PostgreSQL (SQLSTATE) al lenguaje de negocio
 * (especificación §17). Los mensajes por restricción se agregan con cada módulo.
 */
export const MENSAJES_RESTRICCION: Record<string, string> = {};

export function traducirErrorDb(error: unknown): ErrorAccion {
  const e = (error ?? {}) as ErrorConCodigo;
  const restriccion = /constraint "([^"]+)"/.exec(e.message ?? '')?.[1];
  const especifico = restriccion ? MENSAJES_RESTRICCION[restriccion] : undefined;

  switch (e.code) {
    case '40001':
      return { codigo: 'conflicto_version', mensaje: 'Este registro cambió mientras lo editabas. Recargá para ver la versión actual.' };
    case '23505':
      return { codigo: 'duplicado', mensaje: especifico ?? 'Ya existe un registro con ese código.' };
    case '23P01':
      return { codigo: 'solapamiento', mensaje: especifico ?? 'Se superpone con otro registro en el mismo período.' };
    case '23514':
      return { codigo: 'regla_negocio', mensaje: especifico ?? e.message ?? 'El dato no cumple una regla del sistema.' };
    case '23503':
      return { codigo: 'referencia', mensaje: especifico ?? 'Falta un dato relacionado.' };
    case '55000':
      return { codigo: 'inmutable', mensaje: 'Este dato ya no se modifica: usá Anular y reemplazar o Nueva versión.' };
    case '42501':
      return { codigo: 'sin_permiso', mensaje: 'No tenés permiso para esta acción.' };
    default:
      return { codigo: 'desconocido', mensaje: 'Ocurrió un error inesperado. Intentá de nuevo.' };
  }
}
