/**
 * Menú lateral (revisión del 21/10/2026: «encontrar rápido dónde cargar cada cosa»).
 * Se mantiene después del Sprint 8 (decisión de Gerencia del 29/10/2026: «Más» mareaba; el menú
 * dividido por área era más claro). Las entradas apuntan a las direcciones nuevas de Análisis y Ajustes.
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
      // Sprint 7: una sola pantalla (carga, documentos, gastos, tablero y liquidaciones)
      { href: '/mi-viaje', etiqueta: 'Mi viaje' },
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
    entradas: [
      { href: '/analisis/alertas', etiqueta: 'Alertas de la telemetría' },
      // Migración 122: consumo excesivo, daños en la unidad y velocidad excesiva
      { href: '/actas', etiqueta: 'Actas de infracción' },
    ],
  },
  {
    // Migración 67: seguimiento de clientes, cotizador, tarifas y facturación
    id: 'ventas',
    etiqueta: 'Ventas',
    entradas: [
      { href: '/analisis/ventas', etiqueta: 'Tablero' },
      // Sprint 7: Cotizaciones, con los clientes y las tarifas como pestañas
      { href: '/cotizaciones', etiqueta: 'Cotizaciones', incluye: ['/cotizaciones/clientes', '/cotizaciones/tarifas'] },
    ],
  },
  {
    id: 'logistica',
    // «Todo en el viaje»: cada viaje trae adentro su combustible, su cierre y sus costos.
    etiqueta: 'Viajes',
    entradas: [
      { href: '/analisis/operaciones', etiqueta: 'Operaciones' },
      // Sprint 6: «Tractores» pasó a la Pizarra; la entrada abre los viajes de chofer
      {
        href: '/analisis/viajes',
        etiqueta: 'Viajes de chofer',
        incluye: ['/analisis/cierres', '/analisis/costos', '/analisis/cierres/viajes', '/ajustes/viajes'],
      },
      // Migración 63: todos los cierres pendientes en un lugar, con lo que falta y aprobar varios
      { href: '/analisis/cierres/por-hacer', etiqueta: 'Cierres por hacer' },
      { href: '/pizarra', etiqueta: 'Pizarra Azul' },
      // El mapa de flota con la misma importancia que la Pizarra (es su vista Mapa)
      { href: '/pizarra/mapa', etiqueta: 'Mapa de flota' },
      // Migración 103: los mejores choferes de cada mes
      { href: '/analisis/ranking', etiqueta: 'Ranking de choferes', incluye: ['/analisis/ranking/periodo'] },
    ],
  },
  {
    id: 'combustible',
    etiqueta: 'Combustible',
    entradas: [
      {
        href: '/analisis/cargas',
        etiqueta: 'Cargas',
        incluye: ['/analisis/cargas/por-validar', '/analisis/cargas/sin-ticket', '/analisis/movimientos'],
      },
      { href: '/analisis/tanque', etiqueta: 'Base Mendoza' },
      {
        href: '/analisis/consumo',
        etiqueta: 'Consumo y ralentí',
        incluye: ['/analisis/consumo/cargado-vs-motor', '/analisis/consumo/ralenti'],
      },
    ],
  },
  {
    id: 'flota',
    etiqueta: 'Flota',
    entradas: [
      {
        href: '/ajustes/flota',
        etiqueta: 'Camiones y equipos',
        incluye: ['/ajustes/flota/semirremolques', '/ajustes/flota/gensets', '/ajustes/flota/accesorios'],
      },
      { href: '/ajustes/flota/choferes', etiqueta: 'Choferes' },
      // Migración 109: el chofer fijo de cada tractor, en una sola lista
      { href: '/ajustes/choferes-tractores', etiqueta: 'Choferes de los tractores' },
    ],
  },
  {
    // Migraciones 61 y 62: fondo fijo de los choferes y liquidación mensual.
    id: 'rrhh',
    etiqueta: 'Administración',
    entradas: [
      // Sprint 7: los fondos son una pestaña de Liquidaciones (la entrada queda para quien ve los fondos y no las liquidaciones)
      { href: '/liquidaciones/fondos', etiqueta: 'Fondos de choferes' },
      // Migración 62: liquidación mensual; el resumen y las tarifas son pestañas
      { href: '/liquidaciones', etiqueta: 'Liquidaciones', incluye: ['/liquidaciones/resumen', '/ajustes/liquidacion', '/ajustes/liquidacion/datos-legales'] },
    ],
  },
  {
    // Migración 73: finanzas y contabilidad (los asientos los arma la base)
    id: 'finanzas',
    etiqueta: 'Finanzas',
    entradas: [
      // Migración 101: el módulo de la encargada de finanzas (antes Ventas › Facturación; la ruta no cambia)
      { href: '/analisis/facturacion', etiqueta: 'Facturación y cobranzas' },
      { href: '/analisis/resultados', etiqueta: 'Resumen' },
      { href: '/analisis/gastos', etiqueta: 'Gastos', incluye: ['/ajustes/gastos-fijos'] },
      { href: '/analisis/cobros-pagos', etiqueta: 'Cobros y pagos' },
      // IA-1: margen de contribución por chofer, camión o viaje (migración 119)
      { href: '/analisis/rentabilidad', etiqueta: 'Rentabilidad' },
      // Sprint 7: Bancos y cajas pasa a Conciliación
      { href: '/conciliacion', etiqueta: 'Conciliación' },
      { href: '/analisis/informes', etiqueta: 'Informes' },
      { href: '/ajustes/plan-cuentas', etiqueta: 'Plan de cuentas' },
    ],
  },
  {
    id: 'datos',
    etiqueta: 'Datos',
    entradas: [
      // Sprint 7: los datos de los clientes son una pestaña de Cotizaciones
      { href: '/cotizaciones/datos-clientes', etiqueta: 'Clientes' },
      { href: '/ajustes/lugares', etiqueta: 'Lugares' },
      { href: '/ajustes/lineas', etiqueta: 'Líneas' },
      { href: '/ajustes/proveedores', etiqueta: 'Proveedores y estaciones', incluye: ['/ajustes/proveedores/estaciones'] },
      { href: '/ajustes/transportistas', etiqueta: 'Transportistas y agentes' },
    ],
  },
  {
    id: 'configuracion',
    etiqueta: 'Configuración',
    entradas: [
      { href: '/ajustes/usuarios', etiqueta: 'Usuarios' },
      { href: '/ajustes/monedas/tipos-cambio', etiqueta: 'Monedas y tipos de cambio', incluye: ['/ajustes/monedas'] },
      { href: '/ajustes/parametros', etiqueta: 'Parámetros y catálogos', incluye: ['/ajustes/parametros/catalogos'] },
      { href: '/ajustes/integraciones', etiqueta: 'Datos de los camiones' },
      { href: '/ajustes/integraciones/equipos', etiqueta: 'Equipos GPS (Trackerway)' },
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
