import type { RolApp } from './roles';

/**
 * Matriz de permisos — transcripción literal de la especificación funcional §16.
 *
 * Códigos por celda:
 *   '—'   sin acceso
 *   'L'   lectura
 *   'E'   crear y editar (implica lectura)
 *   'A'   acciones de estado: validar, aprobar, cerrar, anular y reemplazar (implica lectura)
 *   'E A' editar + acciones de estado      'L A' lectura + acciones de estado
 *   'P'   solo registros propios del chofer (lectura + edición propia)
 *   'L*'  lectura condicionada al parámetro ana.gerencia_detalle_alertas = 'detalle'
 *
 * Orden de columnas: Ger, Ope, BMz, Cho, AdC, Ana, RH, Fin, TI, Aud.
 */
export type CodigoCelda = '—' | 'L' | 'E' | 'A' | 'E A' | 'L A' | 'P' | 'L*';

export const ORDEN_COLUMNAS = [
  'gerencia',
  'operaciones',
  'base_mendoza',
  'chofer',
  'adm_combustible',
  'analista_control',
  'rrhh',
  'finanzas',
  'ti',
  'auditor',
] as const satisfies readonly RolApp[];

type Fila = readonly [CodigoCelda, CodigoCelda, CodigoCelda, CodigoCelda, CodigoCelda, CodigoCelda, CodigoCelda, CodigoCelda, CodigoCelda, CodigoCelda];

export const PANTALLAS = {
  //                                         Ger   Ope    BMz  Cho  AdC    Ana    RH     Fin    TI     Aud
  'inicio.dashboard':        { etiqueta: 'Dashboard', fila: ['L', 'L', '—', '—', 'L', 'L', 'L', 'L', 'L', 'L'] },
  'inicio.pendientes':       { etiqueta: 'Mis pendientes', fila: ['—', 'L', 'L', '—', 'L', 'L', 'L', 'L', 'L', '—'] },
  'combustible.cargas':      { etiqueta: 'Cargas y ficha de carga', fila: ['L', 'L', 'E', 'P', 'E A', 'L', '—', 'L', 'L', 'L'] },
  'combustible.documentos':  { etiqueta: 'Documentos de carga', fila: ['—', 'L', 'E', 'P', 'E', 'L', '—', 'L', 'L', 'L'] },
  'combustible.bandejas':    { etiqueta: 'Bandejas de cargas', fila: ['—', '—', '—', '—', 'A', 'L', '—', '—', 'L', 'L'] },
  'combustible.mediciones':  { etiqueta: 'Mediciones manuales', fila: ['—', 'L', 'E', '—', 'E', 'L', '—', '—', 'L', 'L'] },
  'combustible.consumo':     { etiqueta: 'Consumo, conciliación, costo medio', fila: ['L', 'L', '—', '—', 'L', 'L', '—', 'L', 'L', 'L'] },
  // Agregada con el módulo Cierre de viaje (reemplaza la planilla de Excel); no figura en la especificación original.
  // Incluye la lista de viajes (fue.v_viaje): editar = crear y completar borradores; transicionar = aprobar y anular.
  'combustible.cierre_viaje': { etiqueta: 'Viajes y cierres de viaje', fila: ['L', 'L', 'E', '—', 'E A', 'L', '—', 'L', 'L', 'L'] },
  // Agregada con la migración 24 (mochilas y controles). editar = uso de mochila y controles (tc_app);
  // transicionar = puesta en marcha y cierre de vigencia de una mochila, que escriben fue.deposito_combustible
  // y la base solo lo permite a tc_admin (migración 22): por eso solo TI.
  'combustible.depositos':   { etiqueta: 'Mochilas y controles', fila: ['L', 'L', 'E', '—', 'E', 'L', '—', 'L', 'E A', 'L'] },
  'operacion.servicios':     { etiqueta: 'Servicios comerciales', fila: ['L', 'E A', '—', '—', '—', 'L', 'L', 'L A', 'L', 'L'] },
  'operacion.tramos':        { etiqueta: 'Tramos operativos y composición', fila: ['L', 'E A', 'L', '—', '—', 'L', 'L', 'L', 'L', 'L'] },
  'operacion.planificacion': { etiqueta: 'Planificación de flota', fila: ['L', 'E', 'L', '—', '—', 'L', '—', '—', 'L', 'L'] },
  'operacion.control_mendoza': { etiqueta: 'Control Mendoza', fila: ['L', 'E', 'E', 'P', '—', 'L', '—', '—', 'L', 'L'] },
  'operacion.eventos':       { etiqueta: 'Eventos operativos', fila: ['—', 'E', 'E', '—', '—', 'L', '—', '—', 'L', 'L'] },
  'anomalias.alertas':       { etiqueta: 'Bandeja y ficha de alertas', fila: ['L*', '—', '—', '—', '—', 'A', '—', '—', 'L', 'L'] },
  'anomalias.casos':         { etiqueta: 'Casos de revisión', fila: ['L', '—', '—', '—', '—', 'E A', '—', '—', 'L', 'L'] },
  'anomalias.reglas':        { etiqueta: 'Reglas y umbrales de anomalía', fila: ['—', '—', '—', '—', '—', 'L', '—', '—', 'E A', 'L'] },
  'anomalias.lineas_base':   { etiqueta: 'Líneas base y ejecuciones', fila: ['L', '—', '—', '—', '—', 'L', '—', '—', 'L', 'L'] },
  'telemetria.mapa':         { etiqueta: 'Mapa, recorrido, eventos, paradas', fila: ['L', 'L', 'L', '—', 'L', 'L', '—', '—', 'L', 'L'] },
  'telemetria.sesiones':     { etiqueta: 'Sesiones de conductor, resumen diario', fila: ['L', 'L', '—', '—', '—', 'L', '—', '—', 'L', 'L'] },
  'telemetria.calidad':      { etiqueta: 'Calidad de datos', fila: ['—', 'L', '—', '—', 'L', 'L', '—', '—', 'L', 'L'] },
  'flota.camiones':          { etiqueta: 'Camiones y semirremolques', fila: ['L', 'E', 'L', '—', 'L', 'L', '—', 'L', 'E', 'L'] },
  'flota.choferes':          { etiqueta: 'Choferes (sin documento)', fila: ['L', 'E', 'L', 'P', 'L', 'L', 'E', 'L', 'E', 'L'] },
  'flota.documento_chofer':  { etiqueta: 'Documento del chofer', fila: ['—', '—', '—', 'P', '—', 'L', 'E', '—', 'L', 'L'] },
  'flota.asignaciones':      { etiqueta: 'Asignaciones camión–chofer', fila: ['L', 'E', 'L', '—', 'L', 'L', 'L', '—', 'L', 'L'] },
  'flota.dispositivos':      { etiqueta: 'Dispositivos de telemetría', fila: ['—', 'L', '—', '—', '—', 'L', '—', '—', 'E', 'L'] },
  'comercial.clientes':      { etiqueta: 'Clientes', fila: ['L', 'E', '—', '—', '—', '—', '—', 'E', 'L', 'L'] },
  'comercial.ubicaciones':   { etiqueta: 'Ubicaciones y geocercas', fila: ['L', 'E', 'L', '—', 'L', 'L', '—', '—', 'E', 'L'] },
  'comercial.proveedores':   { etiqueta: 'Proveedores y estaciones', fila: ['—', 'L', 'L', '—', 'E', 'L', '—', 'E', 'L', 'L'] },
  'liquidacion.tramos':      { etiqueta: 'Tramos liquidables', fila: ['—', 'L', '—', 'P', '—', '—', 'E A', 'L', 'L', 'L'] },
  'liquidacion.liquidaciones': { etiqueta: 'Liquidaciones', fila: ['L', '—', '—', 'P', '—', '—', 'E A', 'L A', 'L', 'L'] },
  'liquidacion.reglas':      { etiqueta: 'Reglas de liquidación', fila: ['—', '—', '—', '—', '—', '—', 'E', 'L', 'L', 'L'] },
  'finanzas.ingresos':       { etiqueta: 'Ingresos', fila: ['L', 'E', '—', '—', '—', '—', '—', 'E A', 'L', 'L'] },
  'finanzas.costos_directos': { etiqueta: 'Costos directos', fila: ['L', 'E', '—', '—', 'E', '—', '—', 'E A', 'L', 'L'] },
  'finanzas.costos_indirectos': { etiqueta: 'Costos indirectos, índices de ajuste', fila: ['L', '—', '—', '—', '—', '—', '—', 'E', 'L', 'L'] },
  'finanzas.tipos_cambio':   { etiqueta: 'Tipos de cambio', fila: ['L', '—', '—', '—', 'L', '—', 'L', 'E', 'E', 'L'] },
  'finanzas.rentabilidad':   { etiqueta: 'Asignación de costos y rentabilidad', fila: ['L', 'L', '—', '—', '—', '—', '—', 'L', 'L', 'L'] },
  'finanzas.cierre':         { etiqueta: 'Cierre de período', fila: ['L', '—', '—', '—', '—', '—', '—', 'A', 'L', 'L'] },
  'configuracion.catalogos': { etiqueta: 'Monedas, países, catálogos, parámetros', fila: ['L', 'L', '—', '—', 'L', 'L', 'L', 'L', 'E', 'L'] },
  'configuracion.politica_tc': { etiqueta: 'Política de tipo de cambio', fila: ['—', '—', '—', '—', '—', '—', '—', 'E', 'E', 'L'] },
  'auditoria.bitacora':      { etiqueta: 'Bitácora de cambios', fila: ['—', '—', '—', '—', '—', '—', '—', '—', 'L', 'L'] },
  'auditoria.accesos':       { etiqueta: 'Accesos sensibles', fila: ['—', '—', '—', '—', '—', '—', '—', '—', '—', 'L'] },
  'auditoria.historial_alertas': { etiqueta: 'Historial de alertas', fila: ['—', '—', '—', '—', '—', 'L', '—', '—', 'L', 'L'] },
  'auditoria.usuarios':      { etiqueta: 'Usuarios', fila: ['—', '—', '—', '—', '—', '—', '—', '—', 'E', 'L'] },
  'auditoria.particiones':   { etiqueta: 'Mantenimiento de particiones', fila: ['—', '—', '—', '—', '—', '—', '—', '—', 'E', 'L'] },
} as const satisfies Record<string, { etiqueta: string; fila: Fila }>;

export type PantallaId = keyof typeof PANTALLAS;
export const IDS_PANTALLA = Object.keys(PANTALLAS) as PantallaId[];
