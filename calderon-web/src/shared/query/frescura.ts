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
  /** El mapa de flota: lo último que llegó de cada camión (las marcas mandan cada 2 a 5 minutos). */
  mapa: 5_000,
} as const;
