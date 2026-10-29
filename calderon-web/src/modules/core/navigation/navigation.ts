/**
 * Menú lateral (revisión del 21/10/2026: «encontrar rápido dónde cargar cada cosa»).
 * - «Cargar nuevo» lleva directo al formulario de alta de lo que más se carga.
 * - Las pantallas hermanas comparten una sola entrada y se cambian con pestañas arriba
 *   de la pantalla (shared/ui/pestanas-secciones.ts). Esas rutas están solo en rutas.ts:
 *   siguen protegidas por el middleware, pero no ocupan lugar en el menú.
 * Sprint 0 (T01): el menú solo dibuja. Qué pantalla habilita cada ruta (y las rutas que no
 * están en el menú) lo dice rutas.ts; el permiso de cada entrada sale de ahí por su href.
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
    etiqueta: 'Hoy',
    // Sprint 3: «Hoy» (lo que le toca a cada uno) reemplaza a Inicio y a Mis pendientes
    entradas: [{ href: '/hoy', etiqueta: 'Hoy' }],
  },
  {
    // Migración 60: lo único que ve el chofer (en el celular).
    id: 'chofer',
    etiqueta: 'Mi trabajo',
    entradas: [
      { href: '/chofer', etiqueta: 'Mi carga' },
      { href: '/chofer/gastos', etiqueta: 'Mis gastos' },
      { href: '/chofer/liquidaciones', etiqueta: 'Mis liquidaciones' },
    ],
  },
  {
    id: 'cargar',
    etiqueta: 'Cargar nuevo',
    entradas: [
      { href: '/combustible/cargas/nueva', etiqueta: 'Carga de combustible', accion: 'editar' },
      { href: '/operacion/operaciones?nueva=1', etiqueta: 'Operación de un cliente', accion: 'editar' },
      { href: '/combustible/movimientos/nuevo', etiqueta: 'Movimiento de combustible', accion: 'editar' },
      { href: '/flota/camiones/nuevo', etiqueta: 'Camión', accion: 'editar' },
      { href: '/flota/choferes/nuevo', etiqueta: 'Chofer', accion: 'editar' },
      { href: '/comercial/clientes/nuevo', etiqueta: 'Cliente', accion: 'editar' },
    ],
  },
  {
    id: 'pendientes',
    etiqueta: 'Alertas',
    entradas: [{ href: '/anomalias/alertas', etiqueta: 'Alertas de la telemetría' }],
  },
  {
    // Migración 67: seguimiento de clientes, cotizador, tarifas y facturación
    id: 'ventas',
    etiqueta: 'Ventas',
    entradas: [
      { href: '/ventas', etiqueta: 'Tablero' },
      { href: '/ventas/empresas', etiqueta: 'Clientes y prospectos' },
      { href: '/ventas/cotizaciones', etiqueta: 'Cotizaciones' },
      { href: '/ventas/tarifas', etiqueta: 'Tarifas y costos' },
    ],
  },
  {
    id: 'logistica',
    // «Todo en el viaje»: cada viaje trae adentro su combustible, su cierre y sus costos.
    etiqueta: 'Viajes',
    entradas: [
      { href: '/operacion/operaciones', etiqueta: 'Operaciones' },
      {
        href: '/operacion/tractores',
        etiqueta: 'Tractores y viajes',
        incluye: ['/operacion/viajes-chofer', '/combustible/cierres', '/operacion/costos', '/combustible/viajes', '/operacion/viajes'],
      },
      // Migración 63: todos los cierres pendientes en un lugar, con lo que falta y aprobar varios
      { href: '/operacion/por-cerrar', etiqueta: 'Cierres por hacer' },
      { href: '/flota/pizarra', etiqueta: 'Pizarra Azul' },
      { href: '/telemetria/mapa', etiqueta: 'Mapa de flota' },
      // Migración 103: los mejores choferes de cada mes
      { href: '/telemetria/ranking', etiqueta: 'Ranking de choferes' },
    ],
  },
  {
    id: 'combustible',
    etiqueta: 'Combustible',
    entradas: [
      {
        href: '/combustible/cargas',
        etiqueta: 'Cargas',
        incluye: ['/combustible/observadas', '/combustible/sin-documento', '/combustible/movimientos'],
      },
      { href: '/combustible/base', etiqueta: 'Base Mendoza' },
      {
        href: '/combustible/costo-medio',
        etiqueta: 'Consumo y ralentí',
        incluye: ['/combustible/conciliacion', '/combustible/ralenti'],
      },
    ],
  },
  {
    id: 'flota',
    etiqueta: 'Flota',
    entradas: [
      {
        href: '/flota/camiones',
        etiqueta: 'Camiones y equipos',
        incluye: ['/flota/semirremolques', '/flota/gensets', '/flota/accesorios'],
      },
      { href: '/flota/choferes', etiqueta: 'Choferes', incluye: ['/telemetria/choferes'] },
      // Migración 109: el chofer fijo de cada tractor, en una sola lista
      { href: '/flota/asignaciones', etiqueta: 'Choferes de los tractores' },
    ],
  },
  {
    // Migraciones 61 y 62: fondo fijo de los choferes y liquidación mensual.
    id: 'rrhh',
    etiqueta: 'Administración',
    entradas: [
      { href: '/rrhh/fondos', etiqueta: 'Fondos de choferes' },
      // Migración 62: liquidación mensual; el resumen y las tarifas son pestañas
      { href: '/rrhh/liquidaciones', etiqueta: 'Liquidaciones', incluye: ['/rrhh/liquidacion', '/rrhh/tarifas', '/rrhh/datos-legales'] },
    ],
  },
  {
    // Migración 73: finanzas y contabilidad (los asientos los arma la base)
    id: 'finanzas',
    etiqueta: 'Finanzas',
    entradas: [
      // Migración 101: el módulo de la encargada de finanzas (antes Ventas › Facturación; la ruta no cambia)
      { href: '/ventas/facturacion', etiqueta: 'Facturación y cobranzas' },
      { href: '/finanzas', etiqueta: 'Resumen' },
      { href: '/finanzas/gastos', etiqueta: 'Gastos', incluye: ['/finanzas/gastos-fijos'] },
      { href: '/finanzas/cobros-pagos', etiqueta: 'Cobros y pagos' },
      { href: '/finanzas/bancos', etiqueta: 'Bancos y cajas' },
      { href: '/finanzas/informes', etiqueta: 'Informes' },
      { href: '/finanzas/plan-cuentas', etiqueta: 'Plan de cuentas' },
    ],
  },
  {
    id: 'datos',
    etiqueta: 'Datos',
    entradas: [
      { href: '/comercial/clientes', etiqueta: 'Clientes' },
      { href: '/comercial/ubicaciones', etiqueta: 'Lugares' },
      { href: '/operacion/lineas', etiqueta: 'Líneas' },
      { href: '/comercial/proveedores', etiqueta: 'Proveedores y estaciones', incluye: ['/comercial/estaciones'] },
      { href: '/operacion/transportistas', etiqueta: 'Transportistas externos' },
    ],
  },
  {
    id: 'configuracion',
    etiqueta: 'Configuración',
    entradas: [
      { href: '/configuracion/usuarios', etiqueta: 'Usuarios' },
      { href: '/finanzas/tipos-cambio', etiqueta: 'Monedas y tipos de cambio', incluye: ['/configuracion/monedas'] },
      { href: '/configuracion/parametros', etiqueta: 'Parámetros y catálogos', incluye: ['/configuracion/catalogos'] },
      { href: '/telemetria/datos', etiqueta: 'Datos de los camiones' },
      { href: '/telemetria/equipos', etiqueta: 'Equipos GPS (Trackerway)' },
    ],
  },
];

// Sprint 0 (T01): se mudaron a rutas.ts; se re-exportan para no romper importaciones.
export { RUTAS_PUBLICAS, RUTAS_SIN_PANTALLA, esRutaPublica, esRutaSinPantalla, pantallaDeRuta } from './rutas';

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
