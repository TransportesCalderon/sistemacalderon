/**
 * Grupos de pestañas: pantallas hermanas que comparten una sola entrada del menú.
 * Cada pestaña se muestra solo si el rol puede ver esa pantalla (ver Pestanas).
 */
/**
 * Sprint 8: las direcciones son las nuevas de Análisis y Ajustes (rutas.ts › RUTAS_NUEVAS); la pantalla
 * de cada pestaña es la misma de antes.
 */

/** Análisis › Cargas: las cargas y sus bandejas, y los movimientos del camión. */
export const PESTANAS_REVISAR = [
  { href: '/analisis/cargas', etiqueta: 'Cargas' },
  { href: '/analisis/cargas/por-validar', etiqueta: 'Por validar' },
  { href: '/analisis/cargas/sin-ticket', etiqueta: 'Sin ticket' },
  { href: '/analisis/movimientos', etiqueta: 'Movimientos del camión' },
] as const;

/** Las cargas y sus bandejas. */
export const PESTANAS_CARGAS = PESTANAS_REVISAR;

/** Análisis › Viajes y cierres: los viajes de chofer, sus cierres y sus costos. */
export const PESTANAS_TRACTORES = [
  { href: '/analisis/viajes', etiqueta: 'Viajes de chofer' },
  { href: '/analisis/cierres/por-hacer', etiqueta: 'Cierres por hacer' },
  { href: '/analisis/cierres', etiqueta: 'Cierres de combustible' },
  { href: '/analisis/cierres/viajes', etiqueta: 'Viajes y cierres' },
  { href: '/analisis/costos', etiqueta: 'Costos de viajes' },
] as const;

export const PESTANAS_VIAJES = PESTANAS_TRACTORES;

/** Análisis › Consumo. */
export const PESTANAS_CONSUMO = [
  { href: '/analisis/consumo', etiqueta: 'Consumo por camión' },
  { href: '/analisis/consumo/cargado-vs-motor', etiqueta: 'Cargado vs. motor' },
  { href: '/analisis/consumo/ralenti', etiqueta: 'Ralentí del mes' },
] as const;

/** Análisis › Ranking: el del mes y el puntaje de manejo por período. */
export const PESTANAS_RANKING = [
  { href: '/analisis/ranking', etiqueta: 'Ranking del mes' },
  { href: '/analisis/ranking/periodo', etiqueta: 'Puntaje por período' },
] as const;

/** Ajustes › Flota: equipos y choferes. */
export const PESTANAS_EQUIPOS = [
  { href: '/ajustes/flota', etiqueta: 'Camiones' },
  { href: '/ajustes/flota/semirremolques', etiqueta: 'Semirremolques' },
  { href: '/ajustes/flota/gensets', etiqueta: 'Gensets' },
  { href: '/ajustes/flota/accesorios', etiqueta: 'Accesorios' },
  { href: '/ajustes/flota/choferes', etiqueta: 'Choferes' },
] as const;

export const PESTANAS_CHOFERES = PESTANAS_EQUIPOS;

export const PESTANAS_PROVEEDORES = [
  { href: '/ajustes/proveedores', etiqueta: 'Proveedores' },
  { href: '/ajustes/proveedores/estaciones', etiqueta: 'Estaciones de servicio' },
] as const;

export const PESTANAS_MONEDAS = [
  { href: '/ajustes/monedas/tipos-cambio', etiqueta: 'Tipos de cambio' },
  { href: '/ajustes/monedas', etiqueta: 'Monedas' },
] as const;

export const PESTANAS_AJUSTES = [
  { href: '/ajustes/parametros', etiqueta: 'Parámetros' },
  { href: '/ajustes/parametros/catalogos', etiqueta: 'Catálogos' },
  // Migración 121: la mercadería que se elige en operaciones, tarifas y cotizaciones
  { href: '/ajustes/parametros/tipos-carga', etiqueta: 'Tipos de carga' },
] as const;

/** Ajustes › Integraciones: datos de los camiones y equipos GPS. */
export const PESTANAS_INTEGRACIONES = [
  { href: '/ajustes/integraciones', etiqueta: 'Datos de los camiones' },
  { href: '/ajustes/integraciones/equipos', etiqueta: 'Equipos GPS' },
] as const;

/** Sprint 7: Liquidaciones, con el resumen y los fondos (cierre del período) como pestañas. */
export const PESTANAS_LIQUIDACIONES = [
  { href: '/liquidaciones', etiqueta: 'Liquidaciones' },
  { href: '/liquidaciones/resumen', etiqueta: 'Resumen para liquidar' },
  { href: '/liquidaciones/fondos', etiqueta: 'Fondos de choferes' },
  { href: '/ajustes/liquidacion', etiqueta: 'Tarifas y conceptos' },
  { href: '/ajustes/liquidacion/datos-legales', etiqueta: 'Datos legales' },
] as const;

/** Tarifas y datos legales (Ajustes › Liquidación) usan las mismas pestañas. */
export const PESTANAS_RRHH = PESTANAS_LIQUIDACIONES;

/** Sprint 7: Cotizaciones, con los clientes y las tarifas como pestañas. */
export const PESTANAS_COTIZACIONES = [
  { href: '/cotizaciones', etiqueta: 'Cotizaciones' },
  { href: '/cotizaciones/clientes', etiqueta: 'Clientes y prospectos' },
  { href: '/cotizaciones/datos-clientes', etiqueta: 'Datos de los clientes' },
  { href: '/cotizaciones/tarifas', etiqueta: 'Tarifas y costos' },
] as const;

/** Migración 73: gastos y su plantilla mensual. */
export const PESTANAS_GASTOS = [
  { href: '/analisis/gastos', etiqueta: 'Gastos' },
  { href: '/ajustes/gastos-fijos', etiqueta: 'Gastos fijos' },
  { href: '/analisis/gastos/combustible', etiqueta: 'Combustible' },
] as const;
