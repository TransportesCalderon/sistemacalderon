/** Tiempos de frescura por tipo de dato (arquitectura §12), en milisegundos. */
export const FRESCURA = {
  catalogo: 30 * 60_000,
  maestro: 5 * 60_000,
  transaccional: 30_000,
  bandeja: 15_000,
  telemetriaVivo: 20_000,
  derivado: 10 * 60_000,
  auditoria: 0,
} as const;

/** Intervalos de refresco automático. */
export const REFRESCO = {
  bandeja: 60_000,
  telemetriaVivo: 30_000,
} as const;
