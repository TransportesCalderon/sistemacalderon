/** Resultado de toda server action (arquitectura §10). Nunca se lanza una excepción al cliente. */
export type ErrorCodigo =
  | 'no_autenticado'
  | 'sin_permiso'
  | 'validacion'
  | 'conflicto_version'
  | 'duplicado'
  | 'solapamiento'
  | 'regla_negocio'
  | 'inmutable'
  | 'referencia'
  | 'credenciales'
  | 'desconocido';

export interface ErrorAccion {
  codigo: ErrorCodigo;
  mensaje: string;
  campos?: Record<string, string>;
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ErrorAccion };

export const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });
export const fallo = (codigo: ErrorCodigo, mensaje: string, campos?: Record<string, string>): ActionResult<never> => ({
  ok: false,
  error: campos ? { codigo, mensaje, campos } : { codigo, mensaje },
});
