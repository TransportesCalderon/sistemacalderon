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
  { href: '/operacion/tractores', etiqueta: 'Tractores' },
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

export const PESTANAS_RRHH = [
  { href: '/rrhh/fondos', etiqueta: 'Fondos de choferes' },
  { href: '/rrhh/liquidaciones', etiqueta: 'Liquidaciones' },
  { href: '/rrhh/liquidacion', etiqueta: 'Resumen para liquidar' },
  { href: '/rrhh/tarifas', etiqueta: 'Tarifas y conceptos' },
  { href: '/rrhh/datos-legales', etiqueta: 'Datos legales' },
] as const;

/** Migración 73: gastos y su plantilla mensual. */
export const PESTANAS_GASTOS = [
  { href: '/finanzas/gastos', etiqueta: 'Gastos' },
  { href: '/finanzas/gastos-fijos', etiqueta: 'Gastos fijos' },
  { href: '/finanzas/combustible', etiqueta: 'Combustible' },
] as const;
