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

/** Las rutas de las páginas (las de antes del Sprint 8 siguen acá: son las que se dibujan por dentro). */
const PAGINAS: readonly Ruta[] = [
  // Inicio
  { prefijo: '/inicio', pantalla: 'inicio.dashboard', titulo: 'Inicio' },
  // Sprint 3: «Hoy» reemplaza a Inicio y Mis pendientes
  { prefijo: '/hoy', pantalla: 'inicio.hoy', titulo: 'Hoy' },
  // Mi trabajo
  { prefijo: '/chofer', pantalla: 'chofer.mi_carga', titulo: 'Mi carga' },
  { prefijo: '/chofer/gastos', pantalla: 'chofer.mis_gastos', titulo: 'Mis gastos' },
  { prefijo: '/chofer/liquidaciones', pantalla: 'chofer.mis_liquidaciones', titulo: 'Mis liquidaciones' },
  // Sprint 7: todo lo del chofer en una pantalla (las secciones de gastos y liquidaciones piden su permiso en la página)
  { prefijo: '/mi-viaje', pantalla: 'chofer.mi_carga', titulo: 'Mi viaje' },
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
  // Sprint 7: Cotizaciones, con pestañas (cada una con su pantalla)
  { prefijo: '/cotizaciones', pantalla: 'ventas.cotizaciones', titulo: 'Cotizaciones' },
  { prefijo: '/cotizaciones/clientes', pantalla: 'ventas.empresas', titulo: 'Clientes y prospectos' },
  { prefijo: '/cotizaciones/datos-clientes', pantalla: 'comercial.clientes', titulo: 'Datos de los clientes' },
  { prefijo: '/cotizaciones/tarifas', pantalla: 'ventas.tarifas', titulo: 'Tarifas y costos' },
  // Sprint 7: Liquidaciones, con el resumen y los fondos como pestañas
  { prefijo: '/liquidaciones', pantalla: 'liquidacion.liquidaciones', titulo: 'Liquidaciones' },
  { prefijo: '/liquidaciones/resumen', pantalla: 'liquidacion.liquidaciones', titulo: 'Resumen para liquidar' },
  { prefijo: '/liquidaciones/fondos', pantalla: 'rrhh.fondos', titulo: 'Fondos de choferes' },
  // Sprint 7: Bancos y cajas pasa a Conciliación
  { prefijo: '/conciliacion', pantalla: 'finanzas.bancos', titulo: 'Conciliación' },
  // Viajes
  { prefijo: '/operacion/tractores', pantalla: 'operacion.tramos', titulo: 'Tractores y viajes' },
  { prefijo: '/operacion/por-cerrar', pantalla: 'operacion.tramos', titulo: 'Cierres por hacer' },
  { prefijo: '/flota/pizarra', pantalla: 'flota.pizarra', titulo: 'Pizarra Azul' },
  // Sprint 5: la Pizarra pasa a /pizarra (centro operativo); /flota/pizarra redirige
  { prefijo: '/pizarra', pantalla: 'flota.pizarra', titulo: 'Pizarra Azul' },
  // El mapa de flota, con su propia entrada (vista Mapa de la Pizarra)
  { prefijo: '/pizarra/mapa', pantalla: 'telemetria.mapa', titulo: 'Mapa de flota' },
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
  // IA-1: Rentabilidad (margen de contribución, migración 119). Página propia, no depende del asistente de IA
  { prefijo: '/analisis/rentabilidad', pantalla: 'finanzas.rentabilidad', titulo: 'Rentabilidad' },
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
 * Sprint 8 · Análisis y Ajustes (Plan de migración UX, ítems 30 y 31). Cada dirección nueva muestra
 * la página de siempre (next.config.ts la reescribe por dentro) y la dirección vieja lleva a la nueva.
 * La pantalla que la protege es la de la página vieja: los permisos no cambian.
 * Las altas, ediciones, fichas e impresiones (/nuevo, /[id], /editar, /imprimir) no se mudan.
 */
export const RUTAS_NUEVAS: readonly { nueva: string; vieja: string; titulo: string }[] = [
  // Análisis
  { nueva: '/analisis/consumo', vieja: '/combustible/costo-medio', titulo: 'Consumo por camión' },
  { nueva: '/analisis/consumo/cargado-vs-motor', vieja: '/combustible/conciliacion', titulo: 'Cargado vs. motor' },
  { nueva: '/analisis/consumo/ralenti', vieja: '/combustible/ralenti', titulo: 'Ralentí del mes' },
  { nueva: '/analisis/ranking', vieja: '/telemetria/ranking', titulo: 'Ranking de choferes' },
  { nueva: '/analisis/ranking/periodo', vieja: '/telemetria/choferes', titulo: 'Puntaje de manejo' },
  { nueva: '/analisis/cargas', vieja: '/combustible/cargas', titulo: 'Cargas' },
  { nueva: '/analisis/cargas/por-validar', vieja: '/combustible/observadas', titulo: 'Por validar' },
  { nueva: '/analisis/cargas/sin-ticket', vieja: '/combustible/sin-documento', titulo: 'Sin ticket' },
  { nueva: '/analisis/movimientos', vieja: '/combustible/movimientos', titulo: 'Movimientos del camión' },
  { nueva: '/analisis/cierres', vieja: '/combustible/cierres', titulo: 'Cierres de combustible' },
  { nueva: '/analisis/cierres/por-hacer', vieja: '/operacion/por-cerrar', titulo: 'Cierres por hacer' },
  { nueva: '/analisis/cierres/viajes', vieja: '/combustible/viajes', titulo: 'Viajes y cierres' },
  { nueva: '/analisis/viajes', vieja: '/operacion/viajes-chofer', titulo: 'Viajes de chofer' },
  { nueva: '/analisis/operaciones', vieja: '/operacion/operaciones', titulo: 'Operaciones' },
  { nueva: '/analisis/costos', vieja: '/operacion/costos', titulo: 'Costos de viajes' },
  { nueva: '/analisis/alertas', vieja: '/anomalias/alertas', titulo: 'Alertas de la telemetría' },
  { nueva: '/analisis/tanque', vieja: '/combustible/base', titulo: 'Tanque de Base Mendoza' },
  { nueva: '/analisis/gastos', vieja: '/finanzas/gastos', titulo: 'Gastos' },
  { nueva: '/analisis/gastos/combustible', vieja: '/finanzas/combustible', titulo: 'Combustible' },
  { nueva: '/analisis/cobros-pagos', vieja: '/finanzas/cobros-pagos', titulo: 'Cobros y pagos' },
  { nueva: '/analisis/facturacion', vieja: '/ventas/facturacion', titulo: 'Facturación y cobranzas' },
  { nueva: '/analisis/informes', vieja: '/finanzas/informes', titulo: 'Informes' },
  { nueva: '/analisis/resultados', vieja: '/finanzas', titulo: 'Resumen financiero' },
  { nueva: '/analisis/ventas', vieja: '/ventas', titulo: 'Tablero de ventas' },
  // Ajustes
  { nueva: '/ajustes/usuarios', vieja: '/configuracion/usuarios', titulo: 'Usuarios' },
  { nueva: '/ajustes/parametros', vieja: '/configuracion/parametros', titulo: 'Parámetros' },
  { nueva: '/ajustes/parametros/catalogos', vieja: '/configuracion/catalogos', titulo: 'Catálogos' },
  { nueva: '/ajustes/monedas', vieja: '/configuracion/monedas', titulo: 'Monedas' },
  { nueva: '/ajustes/monedas/tipos-cambio', vieja: '/finanzas/tipos-cambio', titulo: 'Tipos de cambio' },
  { nueva: '/ajustes/plan-cuentas', vieja: '/finanzas/plan-cuentas', titulo: 'Plan de cuentas' },
  { nueva: '/ajustes/gastos-fijos', vieja: '/finanzas/gastos-fijos', titulo: 'Gastos fijos' },
  { nueva: '/ajustes/lugares', vieja: '/comercial/ubicaciones', titulo: 'Lugares' },
  { nueva: '/ajustes/lineas', vieja: '/operacion/lineas', titulo: 'Líneas' },
  { nueva: '/ajustes/proveedores', vieja: '/comercial/proveedores', titulo: 'Proveedores' },
  { nueva: '/ajustes/proveedores/estaciones', vieja: '/comercial/estaciones', titulo: 'Estaciones de servicio' },
  { nueva: '/ajustes/transportistas', vieja: '/operacion/transportistas', titulo: 'Transportistas externos' },
  { nueva: '/ajustes/flota', vieja: '/flota/camiones', titulo: 'Camiones' },
  { nueva: '/ajustes/flota/semirremolques', vieja: '/flota/semirremolques', titulo: 'Semirremolques' },
  { nueva: '/ajustes/flota/gensets', vieja: '/flota/gensets', titulo: 'Gensets' },
  { nueva: '/ajustes/flota/accesorios', vieja: '/flota/accesorios', titulo: 'Tipos de accesorio' },
  { nueva: '/ajustes/flota/choferes', vieja: '/flota/choferes', titulo: 'Choferes' },
  { nueva: '/ajustes/liquidacion', vieja: '/rrhh/tarifas', titulo: 'Tarifas y conceptos' },
  { nueva: '/ajustes/liquidacion/datos-legales', vieja: '/rrhh/datos-legales', titulo: 'Datos legales' },
  { nueva: '/ajustes/integraciones', vieja: '/telemetria/datos', titulo: 'Datos de los camiones' },
  { nueva: '/ajustes/integraciones/equipos', vieja: '/telemetria/equipos', titulo: 'Equipos GPS' },
  // Decisión del 29/10/2026: quedan en Ajustes hasta que la Pizarra haga lo mismo (no se borran)
  { nueva: '/ajustes/viajes', vieja: '/operacion/viajes', titulo: 'Asignar viajes' },
  { nueva: '/ajustes/choferes-tractores', vieja: '/flota/asignaciones', titulo: 'Choferes de los tractores' },
];

function filaDe(rutas: readonly Ruta[], pathname: string): Ruta | null {
  return [...rutas].sort((a, b) => b.prefijo.length - a.prefijo.length).find((r) => coincide(pathname, r.prefijo)) ?? null;
}

export const RUTAS: readonly Ruta[] = [
  ...PAGINAS,
  ...RUTAS_NUEVAS.map(({ nueva, vieja, titulo }) => {
    const fila = filaDe(PAGINAS, vieja);
    if (!fila) throw new Error(`rutas.ts: ${vieja} no tiene pantalla`);
    return { prefijo: nueva, pantalla: fila.pantalla, titulo };
  }),
];

/**
 * Rutas que se mudaron (Plan de migración UX). La dirección vieja redirige a la nueva
 * (next.config.ts). Sprint 8: las redirecciones son permanentes y se mantienen 6 meses,
 * hasta el 29/04/2027; después se pueden sacar junto con las páginas viejas.
 */
export const RUTAS_MOVIDAS: readonly { desde: string; hasta: string }[] = [
  { desde: '/flota/pizarra', hasta: '/pizarra' },
  // Sprint 6: el mapa es la vista Mapa de la Pizarra; los tractores, sus filas (y la ficha del camión)
  { desde: '/telemetria/mapa', hasta: '/pizarra/mapa' },
  { desde: '/operacion/tractores', hasta: '/pizarra' },
  // Sprint 7: el chofer tiene una sola pantalla
  { desde: '/chofer', hasta: '/mi-viaje' },
  { desde: '/chofer/gastos', hasta: '/mi-viaje?ver=gastos' },
  { desde: '/chofer/liquidaciones', hasta: '/mi-viaje?ver=liquidaciones' },
  { desde: '/chofer/tablero', hasta: '/mi-viaje?ver=tablero' },
  // Sprint 7: Liquidaciones (los fondos son su pestaña)
  { desde: '/rrhh/liquidaciones', hasta: '/liquidaciones' },
  { desde: '/rrhh/liquidacion', hasta: '/liquidaciones/resumen' },
  { desde: '/rrhh/fondos', hasta: '/liquidaciones/fondos' },
  // Sprint 7: Cotizaciones con sus pestañas (la ficha de cada cliente se abre en el panel)
  { desde: '/ventas/cotizaciones', hasta: '/cotizaciones' },
  { desde: '/ventas/cotizaciones/:id(\\d+|nueva)', hasta: '/cotizaciones/:id' },
  { desde: '/ventas/empresas', hasta: '/cotizaciones/clientes' },
  { desde: '/comercial/clientes', hasta: '/cotizaciones/datos-clientes' },
  { desde: '/ventas/tarifas', hasta: '/cotizaciones/tarifas' },
  // Sprint 7: Bancos y cajas pasa a Conciliación
  { desde: '/finanzas/bancos', hasta: '/conciliacion' },
  { desde: '/finanzas/bancos/:id(\\d+)', hasta: '/conciliacion/:id' },
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
