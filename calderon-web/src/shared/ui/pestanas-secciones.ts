/**
 * Grupos de pestañas: pantallas hermanas que comparten una sola entrada del menú.
 * Cada pestaña se muestra solo si el rol puede ver esa pantalla (ver Pestanas).
 */
export const PESTANAS_REVISAR = [
  { href: '/combustible/cargas', etiqueta: 'Cargas' },
  { href: '/combustible/observadas', etiqueta: 'Por validar' },
  { href: '/combustible/sin-documento', etiqueta: 'Sin ticket' },
  { href: '/combustible/movimientos', etiqueta: 'Movimientos del camión' },
] as const;

/** Las cargas y sus bandejas. */
export const PESTANAS_CARGAS = PESTANAS_REVISAR;

export const PESTANAS_VIAJES = [
  { href: '/combustible/viajes', etiqueta: 'Viajes' },
  { href: '/combustible/cierres', etiqueta: 'Cierres' },
] as const;

export const PESTANAS_CONSUMO = [
  { href: '/combustible/costo-medio', etiqueta: 'Consumo por camión' },
  { href: '/combustible/conciliacion', etiqueta: 'Cargado vs. motor' },
  { href: '/combustible/ralenti', etiqueta: 'Ralentí del mes' },
] as const;

export const PESTANAS_TRACTORES = [
  { href: '/operacion/viajes-chofer', etiqueta: 'Viajes de chofer' },
  { href: '/operacion/por-cerrar', etiqueta: 'Cierres por hacer' },
  { href: '/combustible/cierres', etiqueta: 'Cierres de combustible' },
  { href: '/operacion/costos', etiqueta: 'Costos de viajes' },
] as const;

export const PESTANAS_EQUIPOS = [
  { href: '/flota/camiones', etiqueta: 'Camiones' },
  { href: '/flota/semirremolques', etiqueta: 'Semirremolques' },
  { href: '/flota/gensets', etiqueta: 'Gensets' },
  { href: '/flota/accesorios', etiqueta: 'Accesorios' },
] as const;

export const PESTANAS_CHOFERES = [
  { href: '/flota/choferes', etiqueta: 'Choferes' },
  { href: '/telemetria/choferes', etiqueta: 'Puntaje de manejo' },
] as const;

export const PESTANAS_PROVEEDORES = [
  { href: '/comercial/proveedores', etiqueta: 'Proveedores' },
  { href: '/comercial/estaciones', etiqueta: 'Estaciones de servicio' },
] as const;

export const PESTANAS_MONEDAS = [
  { href: '/finanzas/tipos-cambio', etiqueta: 'Tipos de cambio' },
  { href: '/configuracion/monedas', etiqueta: 'Monedas' },
] as const;

export const PESTANAS_AJUSTES = [
  { href: '/configuracion/parametros', etiqueta: 'Parámetros' },
  { href: '/configuracion/catalogos', etiqueta: 'Catálogos' },
] as const;

/** Sprint 7: Liquidaciones, con el resumen y los fondos (cierre del período) como pestañas. */
export const PESTANAS_LIQUIDACIONES = [
  { href: '/liquidaciones', etiqueta: 'Liquidaciones' },
  { href: '/liquidaciones/resumen', etiqueta: 'Resumen para liquidar' },
  { href: '/liquidaciones/fondos', etiqueta: 'Fondos de choferes' },
  { href: '/rrhh/tarifas', etiqueta: 'Tarifas y conceptos' },
  { href: '/rrhh/datos-legales', etiqueta: 'Datos legales' },
] as const;

/** Las pantallas de RRHH que todavía no se mudaron (tarifas y datos legales) usan las mismas pestañas. */
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
  { href: '/finanzas/gastos', etiqueta: 'Gastos' },
  { href: '/finanzas/gastos-fijos', etiqueta: 'Gastos fijos' },
  { href: '/finanzas/combustible', etiqueta: 'Combustible' },
] as const;
