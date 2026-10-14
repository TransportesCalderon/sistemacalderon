/**
 * Error de negocio detectado por un servicio antes de ir a la base (precondición).
 * Lleva su propio mensaje para el usuario; server/errors/traducir lo respeta tal cual.
 */
export type CodigoErrorNegocio = 'inmutable' | 'regla_negocio' | 'referencia';

export class ErrorNegocio extends Error {
  constructor(
    public readonly codigo: CodigoErrorNegocio,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorNegocio';
  }
}
