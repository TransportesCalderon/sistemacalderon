import type { PantallaId } from '@/modules/core/permissions/matriz';

/**
 * Menú lateral — especificación funcional §3 (11 grupos, 58 entradas).
 * Cada entrada declara la pantalla de la matriz de permisos que la habilita:
 * la misma lista alimenta el Sidebar y la guardia de rutas del middleware.
 */
export type IconoGrupo =
  | 'inicio'
  | 'combustible'
  | 'operacion'
  | 'anomalias'
  | 'telemetria'
  | 'flota'
  | 'comercial'
  | 'liquidacion'
  | 'finanzas'
  | 'configuracion'
  | 'auditoria';

export interface EntradaMenu {
  href: string;
  etiqueta: string;
  pantalla: PantallaId;
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
    entradas: [
      { href: '/inicio', etiqueta: 'Dashboard', pantalla: 'inicio.dashboard' },
      { href: '/pendientes', etiqueta: 'Mis pendientes', pantalla: 'inicio.pendientes' },
    ],
  },
  {
    id: 'combustible',
    etiqueta: 'Combustible',
    entradas: [
      { href: '/combustible/cargas', etiqueta: 'Cargas', pantalla: 'combustible.cargas' },
      { href: '/combustible/observadas', etiqueta: 'Cargas observadas', pantalla: 'combustible.bandejas' },
      { href: '/combustible/sin-documento', etiqueta: 'Cargas sin documento', pantalla: 'combustible.bandejas' },
      { href: '/combustible/movimientos', etiqueta: 'Movimientos del camión', pantalla: 'combustible.movimientos' },
      { href: '/combustible/base', etiqueta: 'Base Mendoza', pantalla: 'combustible.depositos' },
      { href: '/combustible/viajes', etiqueta: 'Viajes', pantalla: 'combustible.cierre_viaje' },
      { href: '/combustible/cierres', etiqueta: 'Cierres de viaje', pantalla: 'combustible.cierre_viaje' },
      { href: '/combustible/mediciones', etiqueta: 'Mediciones manuales', pantalla: 'combustible.mediciones' },
      { href: '/combustible/consumo-intervalo', etiqueta: 'Consumo por intervalo', pantalla: 'combustible.consumo' },
      { href: '/combustible/consumo-servicio', etiqueta: 'Consumo por servicio', pantalla: 'combustible.consumo' },
      { href: '/combustible/conciliacion', etiqueta: 'Conciliación con telemetría', pantalla: 'combustible.consumo' },
      { href: '/combustible/costo-medio', etiqueta: 'Costo medio por camión', pantalla: 'combustible.consumo' },
    ],
  },
  {
    id: 'operacion',
    etiqueta: 'Operación',
    entradas: [
      { href: '/operacion/servicios', etiqueta: 'Servicios comerciales', pantalla: 'operacion.servicios' },
      { href: '/operacion/tramos', etiqueta: 'Tramos operativos', pantalla: 'operacion.tramos' },
      { href: '/operacion/planificacion', etiqueta: 'Planificación de flota', pantalla: 'operacion.planificacion' },
      { href: '/operacion/control-mendoza', etiqueta: 'Control Mendoza', pantalla: 'operacion.control_mendoza' },
      { href: '/operacion/eventos', etiqueta: 'Eventos operativos', pantalla: 'operacion.eventos' },
    ],
  },
  {
    id: 'anomalias',
    etiqueta: 'Anomalías',
    entradas: [
      { href: '/anomalias/alertas', etiqueta: 'Bandeja de alertas', pantalla: 'anomalias.alertas' },
      { href: '/anomalias/casos', etiqueta: 'Casos de revisión', pantalla: 'anomalias.casos' },
      { href: '/anomalias/reglas', etiqueta: 'Reglas de anomalía', pantalla: 'anomalias.reglas' },
      { href: '/anomalias/umbrales', etiqueta: 'Umbrales por camión o modelo', pantalla: 'anomalias.reglas' },
      { href: '/anomalias/lineas-base', etiqueta: 'Líneas base de consumo', pantalla: 'anomalias.lineas_base' },
      { href: '/anomalias/ejecuciones', etiqueta: 'Ejecuciones del motor', pantalla: 'anomalias.lineas_base' },
    ],
  },
  {
    id: 'telemetria',
    etiqueta: 'Telemetría',
    entradas: [
      { href: '/telemetria/mapa', etiqueta: 'Mapa de flota', pantalla: 'telemetria.mapa' },
      { href: '/telemetria/recorrido', etiqueta: 'Recorrido de camión', pantalla: 'telemetria.mapa' },
      { href: '/telemetria/eventos', etiqueta: 'Eventos', pantalla: 'telemetria.mapa' },
      { href: '/telemetria/paradas', etiqueta: 'Paradas', pantalla: 'telemetria.mapa' },
      { href: '/telemetria/sesiones', etiqueta: 'Sesiones de conductor', pantalla: 'telemetria.sesiones' },
      { href: '/telemetria/resumen-diario', etiqueta: 'Resumen diario', pantalla: 'telemetria.sesiones' },
      { href: '/telemetria/calidad', etiqueta: 'Calidad de datos', pantalla: 'telemetria.calidad' },
    ],
  },
  {
    id: 'flota',
    etiqueta: 'Flota y personas',
    entradas: [
      { href: '/flota/camiones', etiqueta: 'Camiones', pantalla: 'flota.camiones' },
      { href: '/flota/semirremolques', etiqueta: 'Semirremolques', pantalla: 'flota.camiones' },
      { href: '/flota/choferes', etiqueta: 'Choferes', pantalla: 'flota.choferes' },
      { href: '/flota/asignaciones', etiqueta: 'Asignaciones camión-chofer', pantalla: 'flota.asignaciones' },
      { href: '/flota/dispositivos', etiqueta: 'Dispositivos de telemetría', pantalla: 'flota.dispositivos' },
    ],
  },
  {
    id: 'comercial',
    etiqueta: 'Comercial',
    entradas: [
      { href: '/comercial/clientes', etiqueta: 'Clientes', pantalla: 'comercial.clientes' },
      { href: '/comercial/ubicaciones', etiqueta: 'Ubicaciones y geocercas', pantalla: 'comercial.ubicaciones' },
      { href: '/comercial/proveedores', etiqueta: 'Proveedores', pantalla: 'comercial.proveedores' },
      { href: '/comercial/estaciones', etiqueta: 'Estaciones de servicio', pantalla: 'comercial.proveedores' },
    ],
  },
  {
    id: 'liquidacion',
    etiqueta: 'Liquidación',
    entradas: [
      { href: '/liquidacion/tramos-liquidables', etiqueta: 'Tramos liquidables', pantalla: 'liquidacion.tramos' },
      { href: '/liquidacion/liquidaciones', etiqueta: 'Liquidaciones', pantalla: 'liquidacion.liquidaciones' },
      { href: '/liquidacion/reglas', etiqueta: 'Reglas de liquidación', pantalla: 'liquidacion.reglas' },
    ],
  },
  {
    id: 'finanzas',
    etiqueta: 'Finanzas',
    entradas: [
      { href: '/finanzas/ingresos', etiqueta: 'Ingresos', pantalla: 'finanzas.ingresos' },
      { href: '/finanzas/costos-directos', etiqueta: 'Costos directos', pantalla: 'finanzas.costos_directos' },
      { href: '/finanzas/costos-indirectos', etiqueta: 'Costos indirectos', pantalla: 'finanzas.costos_indirectos' },
      { href: '/finanzas/tipos-cambio', etiqueta: 'Tipos de cambio', pantalla: 'finanzas.tipos_cambio' },
      { href: '/finanzas/asignacion', etiqueta: 'Asignación de costos', pantalla: 'finanzas.rentabilidad' },
      { href: '/finanzas/rentabilidad', etiqueta: 'Rentabilidad', pantalla: 'finanzas.rentabilidad' },
      { href: '/finanzas/cierre', etiqueta: 'Cierre de período', pantalla: 'finanzas.cierre' },
      { href: '/finanzas/indices', etiqueta: 'Índices de ajuste', pantalla: 'finanzas.costos_indirectos' },
    ],
  },
  {
    id: 'configuracion',
    etiqueta: 'Configuración',
    entradas: [
      { href: '/configuracion/monedas', etiqueta: 'Monedas y moneda base', pantalla: 'configuracion.catalogos' },
      { href: '/configuracion/paises', etiqueta: 'Países', pantalla: 'configuracion.catalogos' },
      { href: '/configuracion/politica-tipo-cambio', etiqueta: 'Política de tipo de cambio', pantalla: 'configuracion.politica_tc' },
      { href: '/configuracion/catalogos', etiqueta: 'Catálogos', pantalla: 'configuracion.catalogos' },
      { href: '/configuracion/parametros', etiqueta: 'Parámetros', pantalla: 'configuracion.catalogos' },
    ],
  },
  {
    id: 'auditoria',
    etiqueta: 'Auditoría',
    entradas: [
      { href: '/auditoria/bitacora', etiqueta: 'Bitácora de cambios', pantalla: 'auditoria.bitacora' },
      { href: '/auditoria/accesos', etiqueta: 'Accesos sensibles', pantalla: 'auditoria.accesos' },
      { href: '/auditoria/usuarios', etiqueta: 'Usuarios', pantalla: 'auditoria.usuarios' },
      { href: '/auditoria/particiones', etiqueta: 'Mantenimiento de particiones', pantalla: 'auditoria.particiones' },
      { href: '/auditoria/historial-alertas', etiqueta: 'Historial de alertas', pantalla: 'auditoria.historial_alertas' },
    ],
  },
];

/** Rutas que no requieren sesión. */
export const RUTAS_PUBLICAS = ['/login', '/recuperar', '/auth/callback', '/api/health'] as const;

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
