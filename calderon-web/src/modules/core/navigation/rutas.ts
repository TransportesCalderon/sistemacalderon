import type { PantallaId } from '@/modules/core/permissions/matriz';

/**
 * Sprint 0 · T01 (docs/DECISIONES.md, regla 3): la única tabla de permisos de las rutas.
 * Cada ruta (y todo lo que cuelga de ella) la habilita una pantalla de la matriz de permisos.
 * La usan el middleware, la página [...ruta], las pestañas y el menú. El menú (navigation.ts)
 * solo dibuja: no guarda permisos propios.
 * Toda página nueva de app/(app) necesita su fila acá (lo controla tests/rutas.test.ts).
 */
export interface Ruta {
  prefijo: string;
  pantalla: PantallaId;
  titulo: string;
}

export const RUTAS: readonly Ruta[] = [
  // Inicio
  { prefijo: '/inicio', pantalla: 'inicio.dashboard', titulo: 'Inicio' },
  // Sprint 3: «Hoy» reemplaza a Inicio y Mis pendientes
  { prefijo: '/hoy', pantalla: 'inicio.hoy', titulo: 'Hoy' },
  // Mi trabajo
  { prefijo: '/chofer', pantalla: 'chofer.mi_carga', titulo: 'Mi carga' },
  { prefijo: '/chofer/gastos', pantalla: 'chofer.mis_gastos', titulo: 'Mis gastos' },
  { prefijo: '/chofer/liquidaciones', pantalla: 'chofer.mis_liquidaciones', titulo: 'Mis liquidaciones' },
  // Cargar nuevo
  { prefijo: '/combustible/cargas/nueva', pantalla: 'combustible.cargas', titulo: 'Carga de combustible' },
  { prefijo: '/operacion/operaciones', pantalla: 'operacion.servicios', titulo: 'Operaciones' },
  { prefijo: '/combustible/movimientos/nuevo', pantalla: 'combustible.movimientos', titulo: 'Movimiento de combustible' },
  { prefijo: '/flota/camiones/nuevo', pantalla: 'flota.camiones', titulo: 'Camión' },
  { prefijo: '/flota/choferes/nuevo', pantalla: 'flota.choferes', titulo: 'Chofer' },
  { prefijo: '/comercial/clientes/nuevo', pantalla: 'comercial.clientes', titulo: 'Cliente' },
  // Pendientes y alertas
  { prefijo: '/pendientes', pantalla: 'inicio.pendientes', titulo: 'Mis pendientes' },
  { prefijo: '/anomalias/alertas', pantalla: 'anomalias.alertas', titulo: 'Alertas de la telemetría' },
  // Ventas
  { prefijo: '/ventas', pantalla: 'ventas.tablero', titulo: 'Tablero' },
  { prefijo: '/ventas/empresas', pantalla: 'ventas.empresas', titulo: 'Clientes y prospectos' },
  { prefijo: '/ventas/cotizaciones', pantalla: 'ventas.cotizaciones', titulo: 'Cotizaciones' },
  { prefijo: '/ventas/tarifas', pantalla: 'ventas.tarifas', titulo: 'Tarifas y costos' },
  // Viajes
  { prefijo: '/operacion/tractores', pantalla: 'operacion.tramos', titulo: 'Tractores y viajes' },
  { prefijo: '/operacion/por-cerrar', pantalla: 'operacion.tramos', titulo: 'Cierres por hacer' },
  { prefijo: '/flota/pizarra', pantalla: 'flota.pizarra', titulo: 'Pizarra Azul' },
  // Sprint 5: la Pizarra pasa a /pizarra (centro operativo); /flota/pizarra redirige
  { prefijo: '/pizarra', pantalla: 'flota.pizarra', titulo: 'Pizarra Azul' },
  { prefijo: '/telemetria/mapa', pantalla: 'telemetria.mapa', titulo: 'Mapa de flota' },
  { prefijo: '/telemetria/ranking', pantalla: 'telemetria.sesiones', titulo: 'Ranking de choferes' },
  { prefijo: '/operacion/viajes-chofer', pantalla: 'operacion.tramos', titulo: 'Viajes de chofer' },
  { prefijo: '/operacion/costos', pantalla: 'finanzas.costos_directos', titulo: 'Costos de viajes' },
  { prefijo: '/operacion/viajes', pantalla: 'operacion.tramos', titulo: 'Viajes' },
  // Combustible
  { prefijo: '/combustible/cargas', pantalla: 'combustible.cargas', titulo: 'Cargas' },
  { prefijo: '/combustible/base', pantalla: 'combustible.depositos', titulo: 'Base Mendoza' },
  { prefijo: '/combustible/costo-medio', pantalla: 'combustible.consumo', titulo: 'Consumo y ralentí' },
  { prefijo: '/combustible/observadas', pantalla: 'combustible.bandejas', titulo: 'Por validar' },
  { prefijo: '/combustible/sin-documento', pantalla: 'combustible.bandejas', titulo: 'Sin ticket' },
  { prefijo: '/combustible/movimientos', pantalla: 'combustible.movimientos', titulo: 'Movimientos' },
  { prefijo: '/combustible/viajes', pantalla: 'combustible.cierre_viaje', titulo: 'Viajes y cierres' },
  { prefijo: '/combustible/cierres', pantalla: 'combustible.cierre_viaje', titulo: 'Cierres de viaje' },
  { prefijo: '/combustible/conciliacion', pantalla: 'combustible.consumo', titulo: 'Cargado vs. motor' },
  { prefijo: '/combustible/ralenti', pantalla: 'combustible.cierre_viaje', titulo: 'Ralentí del mes' },
  // Flota
  { prefijo: '/flota/camiones', pantalla: 'flota.camiones', titulo: 'Camiones y equipos' },
  { prefijo: '/flota/choferes', pantalla: 'flota.choferes', titulo: 'Choferes' },
  { prefijo: '/flota/asignaciones', pantalla: 'flota.asignaciones', titulo: 'Choferes de los tractores' },
  { prefijo: '/flota/semirremolques', pantalla: 'flota.camiones', titulo: 'Semirremolques' },
  { prefijo: '/flota/gensets', pantalla: 'flota.pizarra', titulo: 'Gensets' },
  { prefijo: '/flota/accesorios', pantalla: 'flota.pizarra', titulo: 'Accesorios' },
  { prefijo: '/telemetria/choferes', pantalla: 'telemetria.sesiones', titulo: 'Puntaje de choferes' },
  // Administración
  { prefijo: '/rrhh/fondos', pantalla: 'rrhh.fondos', titulo: 'Fondos de choferes' },
  { prefijo: '/rrhh/liquidaciones', pantalla: 'liquidacion.liquidaciones', titulo: 'Liquidaciones' },
  { prefijo: '/rrhh/liquidacion', pantalla: 'liquidacion.liquidaciones', titulo: 'Resumen para liquidar' },
  { prefijo: '/rrhh/tarifas', pantalla: 'liquidacion.reglas', titulo: 'Tarifas y conceptos' },
  { prefijo: '/rrhh/datos-legales', pantalla: 'liquidacion.reglas', titulo: 'Datos legales' },
  // Finanzas
  { prefijo: '/ventas/facturacion', pantalla: 'ventas.facturacion', titulo: 'Facturación y cobranzas' },
  { prefijo: '/finanzas', pantalla: 'finanzas.resumen', titulo: 'Resumen' },
  { prefijo: '/finanzas/gastos', pantalla: 'finanzas.gastos', titulo: 'Gastos' },
  { prefijo: '/finanzas/cobros-pagos', pantalla: 'finanzas.cobros_pagos', titulo: 'Cobros y pagos' },
  { prefijo: '/finanzas/bancos', pantalla: 'finanzas.bancos', titulo: 'Bancos y cajas' },
  { prefijo: '/finanzas/informes', pantalla: 'finanzas.informes', titulo: 'Informes' },
  { prefijo: '/finanzas/plan-cuentas', pantalla: 'finanzas.plan_cuentas', titulo: 'Plan de cuentas' },
  { prefijo: '/finanzas/gastos-fijos', pantalla: 'finanzas.gastos', titulo: 'Gastos fijos' },
  // Sprint 0: antes la cuidaba finanzas.resumen (por el prefijo /finanzas) y la página pedía finanzas.gastos
  { prefijo: '/finanzas/combustible', pantalla: 'finanzas.gastos', titulo: 'Combustible' },
  // Datos
  { prefijo: '/comercial/clientes', pantalla: 'comercial.clientes', titulo: 'Clientes' },
  { prefijo: '/comercial/ubicaciones', pantalla: 'comercial.ubicaciones', titulo: 'Lugares' },
  { prefijo: '/operacion/lineas', pantalla: 'operacion.servicios', titulo: 'Líneas' },
  { prefijo: '/comercial/proveedores', pantalla: 'comercial.proveedores', titulo: 'Proveedores y estaciones' },
  { prefijo: '/operacion/transportistas', pantalla: 'operacion.servicios', titulo: 'Transportistas externos' },
  { prefijo: '/comercial/estaciones', pantalla: 'comercial.proveedores', titulo: 'Estaciones de servicio' },
  // Configuración
  { prefijo: '/configuracion/usuarios', pantalla: 'configuracion.usuarios', titulo: 'Usuarios' },
  { prefijo: '/finanzas/tipos-cambio', pantalla: 'finanzas.tipos_cambio', titulo: 'Monedas y tipos de cambio' },
  { prefijo: '/configuracion/parametros', pantalla: 'configuracion.catalogos', titulo: 'Parámetros y catálogos' },
  { prefijo: '/telemetria/datos', pantalla: 'telemetria.calidad', titulo: 'Datos de los camiones' },
  { prefijo: '/telemetria/equipos', pantalla: 'telemetria.calidad', titulo: 'Equipos GPS (Trackerway)' },
  { prefijo: '/configuracion/monedas', pantalla: 'configuracion.catalogos', titulo: 'Monedas' },
  { prefijo: '/configuracion/catalogos', pantalla: 'configuracion.catalogos', titulo: 'Catálogos' },
];

/**
 * Rutas que se mudaron (Plan de migración UX). La dirección vieja redirige a la nueva
 * (next.config.ts, temporal hasta el Sprint 8): los enlaces guardados siguen funcionando.
 */
export const RUTAS_MOVIDAS: readonly { desde: string; hasta: string }[] = [
  { desde: '/flota/pizarra', hasta: '/pizarra' },
  // Sprint 6: el mapa es la vista Mapa de la Pizarra; los tractores, sus filas (y la ficha del camión)
  { desde: '/telemetria/mapa', hasta: '/pizarra?vista=mapa' },
  { desde: '/operacion/tractores', hasta: '/pizarra' },
];

/** Rutas que no requieren sesión. */
export const RUTAS_PUBLICAS = ['/login', '/recuperar', '/auth/callback', '/api/health', '/api/publico'] as const;

/** Rutas que requieren sesión pero no un permiso de pantalla. */
export const RUTAS_SIN_PANTALLA = ['/sin-acceso', '/perfil'] as const;

function coincide(pathname: string, ruta: string): boolean {
  return pathname === ruta || pathname.startsWith(`${ruta}/`);
}

export function esRutaPublica(pathname: string): boolean {
  return RUTAS_PUBLICAS.some((r) => coincide(pathname, r));
}

export function esRutaSinPantalla(pathname: string): boolean {
  return RUTAS_SIN_PANTALLA.some((r) => coincide(pathname, r));
}

const POR_LONGITUD = [...RUTAS].sort((a, b) => b.prefijo.length - a.prefijo.length);

/** Fila de la ruta (coincidencia por prefijo más largo); null si la ruta no existe en la tabla. */
export function rutaDe(pathname: string): Ruta | null {
  return POR_LONGITUD.find((r) => coincide(pathname, r.prefijo)) ?? null;
}

/** Pantalla que protege una ruta; null si no está en la tabla. */
export function pantallaDeRuta(pathname: string): PantallaId | null {
  return rutaDe(pathname)?.pantalla ?? null;
}
