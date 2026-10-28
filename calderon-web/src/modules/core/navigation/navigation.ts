import type { PantallaId } from '@/modules/core/permissions/matriz';

/**
 * Menú lateral (revisión del 21/10/2026: «encontrar rápido dónde cargar cada cosa»).
 * - «Cargar nuevo» lleva directo al formulario de alta de lo que más se carga.
 * - Las pantallas hermanas comparten una sola entrada y se cambian con pestañas arriba
 *   de la pantalla (shared/ui/pestanas-secciones.ts). Esas rutas quedan «ocultas»: siguen
 *   protegidas por el middleware, pero no ocupan lugar en el menú.
 * Cada entrada declara la pantalla de la matriz de permisos que la habilita: la misma lista
 * alimenta el Sidebar y la guardia de rutas del middleware.
 */
export type IconoGrupo =
  | 'inicio'
  | 'chofer'
  | 'cargar'
  | 'pendientes'
  | 'ventas'
  | 'logistica'
  | 'combustible'
  | 'flota'
  | 'rrhh'
  | 'finanzas'
  | 'datos'
  | 'configuracion';

export interface EntradaMenu {
  href: string;
  etiqueta: string;
  pantalla: PantallaId;
  /** Ruta protegida que no aparece en el menú (se llega desde las pestañas u otra pantalla). */
  oculta?: boolean;
  /** Permiso que hace falta para verla en el menú (por defecto «ver»; las altas piden «editar»). */
  accion?: 'ver' | 'editar';
  /** Rutas de las pestañas de esta entrada: estando en ellas, la entrada se marca como actual. */
  incluye?: readonly string[];
}

export interface GrupoMenu {
  id: IconoGrupo;
  etiqueta: string;
  entradas: readonly EntradaMenu[];
}

export const NAVEGACION: readonly GrupoMenu[] = [
  {
    id: 'inicio',
    etiqueta: 'Inicio',
    entradas: [{ href: '/inicio', etiqueta: 'Inicio', pantalla: 'inicio.dashboard' }],
  },
  {
    // Migración 60: lo único que ve el chofer (en el celular).
    id: 'chofer',
    etiqueta: 'Mi trabajo',
    entradas: [
      { href: '/chofer', etiqueta: 'Mi carga', pantalla: 'chofer.mi_carga' },
      { href: '/chofer/gastos', etiqueta: 'Mis gastos', pantalla: 'chofer.mis_gastos' },
      { href: '/chofer/liquidaciones', etiqueta: 'Mis liquidaciones', pantalla: 'chofer.mis_liquidaciones' },
    ],
  },
  {
    id: 'cargar',
    etiqueta: 'Cargar nuevo',
    entradas: [
      { href: '/combustible/cargas/nueva', etiqueta: 'Carga de combustible', pantalla: 'combustible.cargas', accion: 'editar' },
      { href: '/operacion/operaciones?nueva=1', etiqueta: 'Operación de un cliente', pantalla: 'operacion.servicios', accion: 'editar' },
      { href: '/combustible/movimientos/nuevo', etiqueta: 'Movimiento de combustible', pantalla: 'combustible.movimientos', accion: 'editar' },
      { href: '/flota/camiones/nuevo', etiqueta: 'Camión', pantalla: 'flota.camiones', accion: 'editar' },
      { href: '/flota/choferes/nuevo', etiqueta: 'Chofer', pantalla: 'flota.choferes', accion: 'editar' },
      { href: '/comercial/clientes/nuevo', etiqueta: 'Cliente', pantalla: 'comercial.clientes', accion: 'editar' },
    ],
  },
  {
    id: 'pendientes',
    etiqueta: 'Pendientes y alertas',
    entradas: [
      { href: '/pendientes', etiqueta: 'Mis pendientes', pantalla: 'inicio.pendientes' },
      { href: '/anomalias/alertas', etiqueta: 'Alertas de la telemetría', pantalla: 'anomalias.alertas' },
    ],
  },
  {
    // Migración 67: seguimiento de clientes, cotizador, tarifas y facturación
    id: 'ventas',
    etiqueta: 'Ventas',
    entradas: [
      { href: '/ventas', etiqueta: 'Tablero', pantalla: 'ventas.tablero' },
      { href: '/ventas/empresas', etiqueta: 'Clientes y prospectos', pantalla: 'ventas.empresas' },
      { href: '/ventas/cotizaciones', etiqueta: 'Cotizaciones', pantalla: 'ventas.cotizaciones' },
      { href: '/ventas/tarifas', etiqueta: 'Tarifas y costos', pantalla: 'ventas.tarifas' },
    ],
  },
  {
    id: 'logistica',
    // «Todo en el viaje»: cada viaje trae adentro su combustible, su cierre y sus costos.
    etiqueta: 'Viajes',
    entradas: [
      { href: '/operacion/operaciones', etiqueta: 'Operaciones', pantalla: 'operacion.servicios' },
      {
        href: '/operacion/tractores',
        etiqueta: 'Tractores y viajes',
        pantalla: 'operacion.tramos',
        incluye: ['/operacion/viajes-chofer', '/combustible/cierres', '/operacion/costos', '/combustible/viajes', '/operacion/viajes'],
      },
      // Migración 63: todos los cierres pendientes en un lugar, con lo que falta y aprobar varios
      { href: '/operacion/por-cerrar', etiqueta: 'Cierres por hacer', pantalla: 'operacion.tramos' },
      { href: '/flota/pizarra', etiqueta: 'Pizarra Azul', pantalla: 'flota.pizarra' },
      { href: '/telemetria/mapa', etiqueta: 'Mapa de flota', pantalla: 'telemetria.mapa' },
      // Migración 103: los mejores choferes de cada mes
      { href: '/telemetria/ranking', etiqueta: 'Ranking de choferes', pantalla: 'telemetria.sesiones' },
      { href: '/operacion/viajes-chofer', etiqueta: 'Viajes de chofer', pantalla: 'operacion.tramos', oculta: true },
      { href: '/operacion/costos', etiqueta: 'Costos de viajes', pantalla: 'finanzas.costos_directos', oculta: true },
      { href: '/operacion/viajes', etiqueta: 'Viajes', pantalla: 'operacion.tramos', oculta: true },
    ],
  },
  {
    id: 'combustible',
    etiqueta: 'Combustible',
    entradas: [
      {
        href: '/combustible/cargas',
        etiqueta: 'Cargas',
        pantalla: 'combustible.cargas',
        incluye: ['/combustible/observadas', '/combustible/sin-documento', '/combustible/movimientos'],
      },
      { href: '/combustible/base', etiqueta: 'Base Mendoza', pantalla: 'combustible.depositos' },
      {
        href: '/combustible/costo-medio',
        etiqueta: 'Consumo y ralentí',
        pantalla: 'combustible.consumo',
        incluye: ['/combustible/conciliacion', '/combustible/ralenti'],
      },
      { href: '/combustible/observadas', etiqueta: 'Por validar', pantalla: 'combustible.bandejas', oculta: true },
      { href: '/combustible/sin-documento', etiqueta: 'Sin ticket', pantalla: 'combustible.bandejas', oculta: true },
      { href: '/combustible/movimientos', etiqueta: 'Movimientos', pantalla: 'combustible.movimientos', oculta: true },
      { href: '/combustible/viajes', etiqueta: 'Viajes y cierres', pantalla: 'combustible.cierre_viaje', oculta: true },
      { href: '/combustible/cierres', etiqueta: 'Cierres de viaje', pantalla: 'combustible.cierre_viaje', oculta: true },
      { href: '/combustible/conciliacion', etiqueta: 'Cargado vs. motor', pantalla: 'combustible.consumo', oculta: true },
      { href: '/combustible/ralenti', etiqueta: 'Ralentí del mes', pantalla: 'combustible.cierre_viaje', oculta: true },
    ],
  },
  {
    id: 'flota',
    etiqueta: 'Flota',
    entradas: [
      {
        href: '/flota/camiones',
        etiqueta: 'Camiones y equipos',
        pantalla: 'flota.camiones',
        incluye: ['/flota/semirremolques', '/flota/gensets', '/flota/accesorios'],
      },
      { href: '/flota/choferes', etiqueta: 'Choferes', pantalla: 'flota.choferes', incluye: ['/telemetria/choferes'] },
      { href: '/flota/semirremolques', etiqueta: 'Semirremolques', pantalla: 'flota.camiones', oculta: true },
      { href: '/flota/gensets', etiqueta: 'Gensets', pantalla: 'flota.pizarra', oculta: true },
      { href: '/flota/accesorios', etiqueta: 'Accesorios', pantalla: 'flota.pizarra', oculta: true },
      { href: '/telemetria/choferes', etiqueta: 'Puntaje de choferes', pantalla: 'telemetria.sesiones', oculta: true },
    ],
  },
  {
    // Migraciones 61 y 62: fondo fijo de los choferes y liquidación mensual.
    id: 'rrhh',
    etiqueta: 'Administración',
    entradas: [
      { href: '/rrhh/fondos', etiqueta: 'Fondos de choferes', pantalla: 'rrhh.fondos' },
      // Migración 62: liquidación mensual; el resumen y las tarifas son pestañas
      { href: '/rrhh/liquidaciones', etiqueta: 'Liquidaciones', pantalla: 'liquidacion.liquidaciones', incluye: ['/rrhh/liquidacion', '/rrhh/tarifas', '/rrhh/datos-legales'] },
      { href: '/rrhh/liquidacion', etiqueta: 'Resumen para liquidar', pantalla: 'liquidacion.liquidaciones', oculta: true },
      { href: '/rrhh/tarifas', etiqueta: 'Tarifas y conceptos', pantalla: 'liquidacion.reglas', oculta: true },
      { href: '/rrhh/datos-legales', etiqueta: 'Datos legales', pantalla: 'liquidacion.reglas', oculta: true },
    ],
  },
  {
    // Migración 73: finanzas y contabilidad (los asientos los arma la base)
    id: 'finanzas',
    etiqueta: 'Finanzas',
    entradas: [
      // Migración 101: el módulo de la encargada de finanzas (antes Ventas › Facturación; la ruta no cambia)
      { href: '/ventas/facturacion', etiqueta: 'Facturación y cobranzas', pantalla: 'ventas.facturacion' },
      { href: '/finanzas', etiqueta: 'Resumen', pantalla: 'finanzas.resumen' },
      { href: '/finanzas/gastos', etiqueta: 'Gastos', pantalla: 'finanzas.gastos', incluye: ['/finanzas/gastos-fijos'] },
      { href: '/finanzas/cobros-pagos', etiqueta: 'Cobros y pagos', pantalla: 'finanzas.cobros_pagos' },
      { href: '/finanzas/bancos', etiqueta: 'Bancos y cajas', pantalla: 'finanzas.bancos' },
      { href: '/finanzas/informes', etiqueta: 'Informes', pantalla: 'finanzas.informes' },
      { href: '/finanzas/plan-cuentas', etiqueta: 'Plan de cuentas', pantalla: 'finanzas.plan_cuentas' },
      { href: '/finanzas/gastos-fijos', etiqueta: 'Gastos fijos', pantalla: 'finanzas.gastos', oculta: true },
    ],
  },
  {
    id: 'datos',
    etiqueta: 'Datos',
    entradas: [
      { href: '/comercial/clientes', etiqueta: 'Clientes', pantalla: 'comercial.clientes' },
      { href: '/comercial/ubicaciones', etiqueta: 'Lugares', pantalla: 'comercial.ubicaciones' },
      { href: '/operacion/lineas', etiqueta: 'Líneas', pantalla: 'operacion.servicios' },
      { href: '/comercial/proveedores', etiqueta: 'Proveedores y estaciones', pantalla: 'comercial.proveedores', incluye: ['/comercial/estaciones'] },
      { href: '/operacion/transportistas', etiqueta: 'Transportistas externos', pantalla: 'operacion.servicios' },
      { href: '/comercial/estaciones', etiqueta: 'Estaciones de servicio', pantalla: 'comercial.proveedores', oculta: true },
    ],
  },
  {
    id: 'configuracion',
    etiqueta: 'Configuración',
    entradas: [
      { href: '/configuracion/usuarios', etiqueta: 'Usuarios', pantalla: 'configuracion.usuarios' },
      { href: '/finanzas/tipos-cambio', etiqueta: 'Monedas y tipos de cambio', pantalla: 'finanzas.tipos_cambio', incluye: ['/configuracion/monedas'] },
      { href: '/configuracion/parametros', etiqueta: 'Parámetros y catálogos', pantalla: 'configuracion.catalogos', incluye: ['/configuracion/catalogos'] },
      { href: '/telemetria/datos', etiqueta: 'Datos de los camiones', pantalla: 'telemetria.calidad' },
      { href: '/telemetria/equipos', etiqueta: 'Equipos GPS (Trackerway)', pantalla: 'telemetria.calidad' },
      { href: '/configuracion/monedas', etiqueta: 'Monedas', pantalla: 'configuracion.catalogos', oculta: true },
      { href: '/configuracion/catalogos', etiqueta: 'Catálogos', pantalla: 'configuracion.catalogos', oculta: true },
    ],
  },
];

/** Rutas que no requieren sesión. */
export const RUTAS_PUBLICAS = ['/login', '/recuperar', '/auth/callback', '/api/health', '/api/publico'] as const;

/** Rutas que requieren sesión pero no un permiso de pantalla. */
export const RUTAS_SIN_PANTALLA = ['/sin-acceso', '/perfil'] as const;

export function esRutaPublica(pathname: string): boolean {
  return RUTAS_PUBLICAS.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

export function esRutaSinPantalla(pathname: string): boolean {
  return RUTAS_SIN_PANTALLA.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

const ENTRADAS_POR_LONGITUD = NAVEGACION.flatMap((g) => g.entradas)
  .filter((e) => !e.href.includes('?'))
  .sort((a, b) => b.href.length - a.href.length);

/** Pantalla que protege una ruta (coincidencia por prefijo más largo); null si no es del menú. */
export function pantallaDeRuta(pathname: string): PantallaId | null {
  const entrada = ENTRADAS_POR_LONGITUD.find((e) => pathname === e.href || pathname.startsWith(`${e.href}/`));
  return entrada?.pantalla ?? null;
}

function coincide(pathname: string, ruta: string): boolean {
  return pathname === ruta || pathname.startsWith(`${ruta}/`);
}

/**
 * Entrada del menú que corresponde a la ruta actual (la coincidencia más larga, contando
 * las pestañas que incluye). Así se marca una sola entrada, aunque varias empiecen igual.
 */
export function entradaActual(pathname: string, entradas: readonly EntradaMenu[]): string | null {
  let mejor: { href: string; largo: number } | null = null;
  for (const e of entradas) {
    // Las altas con «?» (abren un formulario sobre una lista) no marcan la lista
    for (const r of [e.href, ...(e.incluye ?? [])].filter((x) => !x.includes('?'))) {
      const largo = r.length;
      if (coincide(pathname, r) && (!mejor || largo > mejor.largo)) mejor = { href: e.href, largo };
    }
  }
  return mejor?.href ?? null;
}
