import type { PantallaId } from '@/modules/core/permissions/matriz';

/**
 * Menú lateral (rediseño del 20/10/2026: «lo sencillo antes que lo completo»).
 * Pocos grupos, por tarea del día a día, y solo pantallas que ya funcionan: las de la
 * especificación que todavía no existen no se muestran. Cada entrada declara la pantalla
 * de la matriz de permisos que la habilita: la misma lista alimenta el Sidebar y la
 * guardia de rutas del middleware. Las entradas «ocultas» son rutas que siguen
 * protegidas pero se abren desde otra pantalla (pestañas o enlaces), no desde el menú.
 */
export type IconoGrupo = 'inicio' | 'pendientes' | 'logistica' | 'combustible' | 'flota' | 'datos' | 'configuracion';

export interface EntradaMenu {
  href: string;
  etiqueta: string;
  pantalla: PantallaId;
  /** Ruta protegida que no aparece en el menú (se llega desde otra pantalla). */
  oculta?: boolean;
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
    id: 'pendientes',
    etiqueta: 'Mis pendientes',
    entradas: [{ href: '/pendientes', etiqueta: 'Mis pendientes', pantalla: 'inicio.pendientes' }],
  },
  {
    id: 'logistica',
    // 21/10/2026: «todo en el viaje» — cada viaje trae adentro su combustible, su cierre y sus costos.
    etiqueta: 'Viajes',
    entradas: [
      { href: '/operacion/tractores', etiqueta: 'Tractores y viajes', pantalla: 'operacion.tramos' },
      { href: '/operacion/viajes-chofer', etiqueta: 'Viajes de chofer', pantalla: 'operacion.tramos', oculta: true },
      { href: '/operacion/operaciones', etiqueta: 'Operaciones', pantalla: 'operacion.servicios' },
      { href: '/operacion/costos', etiqueta: 'Costos de viajes', pantalla: 'finanzas.costos_directos' },
      { href: '/flota/pizarra', etiqueta: 'Pizarra Azul', pantalla: 'flota.pizarra' },
      { href: '/telemetria/mapa', etiqueta: 'Mapa de flota', pantalla: 'telemetria.mapa' },
      { href: '/operacion/viajes', etiqueta: 'Viajes', pantalla: 'operacion.tramos', oculta: true },
    ],
  },
  {
    id: 'combustible',
    etiqueta: 'Combustible',
    entradas: [
      { href: '/combustible/cargas', etiqueta: 'Cargas', pantalla: 'combustible.cargas' },
      { href: '/combustible/observadas', etiqueta: 'Por revisar', pantalla: 'combustible.bandejas', oculta: true },
      { href: '/combustible/sin-documento', etiqueta: 'Sin ticket', pantalla: 'combustible.bandejas', oculta: true },
      { href: '/combustible/viajes', etiqueta: 'Viajes y cierres', pantalla: 'combustible.cierre_viaje', oculta: true },
      { href: '/combustible/cierres', etiqueta: 'Cierres de viaje', pantalla: 'combustible.cierre_viaje', oculta: true },
      { href: '/combustible/movimientos', etiqueta: 'Movimientos', pantalla: 'combustible.movimientos' },
      { href: '/combustible/base', etiqueta: 'Base Mendoza', pantalla: 'combustible.depositos' },
      { href: '/anomalias/alertas', etiqueta: 'Alertas', pantalla: 'anomalias.alertas' },
      { href: '/combustible/ralenti', etiqueta: 'Ralentí del mes', pantalla: 'combustible.cierre_viaje' },
      { href: '/combustible/costo-medio', etiqueta: 'Consumo', pantalla: 'combustible.consumo' },
      { href: '/combustible/conciliacion', etiqueta: 'Cargado vs. motor', pantalla: 'combustible.consumo', oculta: true },
    ],
  },
  {
    id: 'flota',
    etiqueta: 'Flota',
    entradas: [
      { href: '/flota/camiones', etiqueta: 'Camiones', pantalla: 'flota.camiones' },
      { href: '/flota/semirremolques', etiqueta: 'Semirremolques', pantalla: 'flota.camiones' },
      { href: '/flota/choferes', etiqueta: 'Choferes', pantalla: 'flota.choferes' },
      { href: '/telemetria/choferes', etiqueta: 'Puntaje de choferes', pantalla: 'telemetria.sesiones' },
      { href: '/flota/gensets', etiqueta: 'Gensets', pantalla: 'flota.pizarra' },
      { href: '/flota/accesorios', etiqueta: 'Accesorios', pantalla: 'flota.pizarra' },
    ],
  },
  {
    id: 'datos',
    etiqueta: 'Datos',
    entradas: [
      { href: '/comercial/clientes', etiqueta: 'Clientes', pantalla: 'comercial.clientes' },
      { href: '/comercial/ubicaciones', etiqueta: 'Lugares', pantalla: 'comercial.ubicaciones' },
      { href: '/operacion/lineas', etiqueta: 'Líneas', pantalla: 'operacion.servicios' },
      { href: '/comercial/estaciones', etiqueta: 'Estaciones de servicio', pantalla: 'comercial.proveedores' },
      { href: '/comercial/proveedores', etiqueta: 'Proveedores', pantalla: 'comercial.proveedores' },
      { href: '/operacion/transportistas', etiqueta: 'Transportistas externos', pantalla: 'operacion.servicios' },
    ],
  },
  {
    id: 'configuracion',
    etiqueta: 'Configuración',
    entradas: [
      { href: '/configuracion/usuarios', etiqueta: 'Usuarios', pantalla: 'configuracion.usuarios' },
      { href: '/finanzas/tipos-cambio', etiqueta: 'Tipos de cambio', pantalla: 'finanzas.tipos_cambio' },
      { href: '/configuracion/monedas', etiqueta: 'Monedas', pantalla: 'configuracion.catalogos' },
      { href: '/configuracion/parametros', etiqueta: 'Parámetros', pantalla: 'configuracion.catalogos' },
      { href: '/configuracion/catalogos', etiqueta: 'Catálogos', pantalla: 'configuracion.catalogos' },
      { href: '/telemetria/datos', etiqueta: 'Datos de los camiones', pantalla: 'telemetria.calidad' },
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

const ENTRADAS_POR_LONGITUD = NAVEGACION.flatMap((g) => g.entradas).sort((a, b) => b.href.length - a.href.length);

/** Pantalla que protege una ruta (coincidencia por prefijo más largo); null si no es del menú. */
export function pantallaDeRuta(pathname: string): PantallaId | null {
  const entrada = ENTRADAS_POR_LONGITUD.find((e) => pathname === e.href || pathname.startsWith(`${e.href}/`));
  return entrada?.pantalla ?? null;
}
