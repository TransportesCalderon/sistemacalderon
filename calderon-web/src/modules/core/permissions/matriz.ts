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
 *
 * 22/10/2026 (migración 60): el chofer solo tiene sus dos pantallas propias (chofer.*).
 *
 * Decisión de la empresa (18/10/2026): TI tiene 'E A' en todas las pantallas de negocio para poder
 * probar el sistema completo. Se exceptúa Auditoría (bitácora y accesos sensibles: solo lectura o
 * auditor). La base sigue exigiendo que lo aprobado lo apruebe otro usuario.
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
  'inicio.dashboard':        { etiqueta: 'Dashboard', fila: ['L', 'L', '—', '—', 'L', 'L', 'L', 'L', 'E A', 'L'] },
  'inicio.pendientes':       { etiqueta: 'Mis pendientes', fila: ['—', 'L', 'L', '—', 'L', 'L', 'L', 'L', 'E A', '—'] },
  'combustible.cargas':      { etiqueta: 'Cargas y ficha de carga', fila: ['L', 'L', 'E', '—', 'E A', 'L', '—', 'L', 'E A', 'L'] },
  'combustible.documentos':  { etiqueta: 'Documentos de carga', fila: ['—', 'L', 'E', '—', 'E', 'L', '—', 'L', 'E A', 'L'] },
  'combustible.bandejas':    { etiqueta: 'Bandejas de cargas', fila: ['—', '—', '—', '—', 'A', 'L', '—', '—', 'E A', 'L'] },
  'combustible.mediciones':  { etiqueta: 'Mediciones manuales', fila: ['—', 'L', 'E', '—', 'E', 'L', '—', '—', 'E A', 'L'] },
  'combustible.consumo':     { etiqueta: 'Consumo, conciliación, costo medio', fila: ['L', 'L', '—', '—', 'L', 'L', '—', 'L', 'E A', 'L'] },
  // Agregada con el módulo Cierre de viaje (reemplaza la planilla de Excel); no figura en la especificación original.
  // Incluye la lista de viajes (fue.v_viaje): editar = crear y completar borradores; transicionar = aprobar y anular.
  'combustible.cierre_viaje': { etiqueta: 'Viajes y cierres de viaje', fila: ['L', 'L', 'E', '—', 'E A', 'L', '—', 'L', 'E A', 'L'] },
  // Agregada con la migración 26 (combustible del camión unificado): descargas a base o a otro camión y
  // movimientos con motivo. editar = registrar y pedir un reverso; transicionar = aprobar o rechazar lo que
  // registró otro usuario (la base además exige un rol aprobador: fue.correccion_roles_aprobadores).
  'combustible.movimientos': { etiqueta: 'Movimientos del camión', fila: ['L', 'L', 'E', '—', 'E A', 'L', '—', 'L', 'E A', 'L'] },
  // Agregada con la migración 24; pantalla Combustible > Base Mendoza (migración 30). editar = controles, compras y
  // otros movimientos con motivo, responsable y traspaso; transicionar = aprobar o rechazar movimientos con motivo y
  // aprobar o anular segmentos (la base además exige rol aprobador y que no sea el responsable del segmento).
  // El alta y la edición del tanque son configuración (configuracion.catalogos: solo TI; la base solo deja a tc_admin).
  'combustible.depositos':   { etiqueta: 'Tanque de base', fila: ['L', 'L', 'E', '—', 'E A', 'L', '—', 'L', 'E A', 'L'] },
  'operacion.servicios':     { etiqueta: 'Servicios comerciales', fila: ['L', 'E A', '—', '—', '—', 'L', 'L', 'L A', 'E A', 'L'] },
  // 21/10/2026: Adm. de combustible ve los viajes (el cierre de combustible está adentro del viaje).
  'operacion.tramos':        { etiqueta: 'Tramos operativos y composición', fila: ['L', 'E A', 'L', '—', 'L', 'L', 'L', 'L', 'E A', 'L'] },
  'operacion.planificacion': { etiqueta: 'Planificación de flota', fila: ['L', 'E', 'L', '—', '—', 'L', '—', '—', 'E A', 'L'] },
  'operacion.control_mendoza': { etiqueta: 'Control Mendoza', fila: ['L', 'E', 'E', '—', '—', 'L', '—', '—', 'E A', 'L'] },
  'operacion.eventos':       { etiqueta: 'Eventos operativos', fila: ['—', 'E', 'E', '—', '—', 'L', '—', '—', 'E A', 'L'] },
  // Migración 49: Administración de combustible también revisa alertas (la base lo permite).
  'anomalias.alertas':       { etiqueta: 'Bandeja y ficha de alertas', fila: ['L*', '—', '—', '—', 'A', 'A', '—', '—', 'E A', 'L'] },
  'anomalias.casos':         { etiqueta: 'Casos de revisión', fila: ['L', '—', '—', '—', '—', 'E A', '—', '—', 'E A', 'L'] },
  // Migración 49: Control cambia los umbrales (la base lo permite a Control y TI).
  'anomalias.reglas':        { etiqueta: 'Reglas y umbrales de anomalía', fila: ['—', '—', '—', '—', '—', 'E', '—', '—', 'E A', 'L'] },
  'anomalias.lineas_base':   { etiqueta: 'Líneas base y ejecuciones', fila: ['L', '—', '—', '—', '—', 'L', '—', '—', 'E A', 'L'] },
  'telemetria.mapa':         { etiqueta: 'Mapa, recorrido, eventos, paradas', fila: ['L', 'L', 'L', '—', 'L', 'L', '—', '—', 'E A', 'L'] },
  'telemetria.sesiones':     { etiqueta: 'Sesiones de conductor, resumen diario', fila: ['L', 'L', '—', '—', '—', 'L', '—', '—', 'E A', 'L'] },
  'telemetria.calidad':      { etiqueta: 'Calidad de datos', fila: ['—', 'L', '—', '—', 'L', 'L', '—', '—', 'E A', 'L'] },
  // Agregada con la migración 39 (reemplaza la planilla PIZARRA SEMI GENSET). editar = lugar en playa, observación y
  // accesorios del semi, tipos de accesorio y gensets. El viaje (tractor, chofer, carga) se asigna en Operación.
  'flota.pizarra':           { etiqueta: 'Pizarra Azul, gensets y accesorios', fila: ['L', 'E', 'E', '—', 'L', 'L', '—', 'L', 'E A', 'L'] },
  'flota.camiones':          { etiqueta: 'Camiones y semirremolques', fila: ['L', 'E', 'L', '—', 'L', 'L', '—', 'L', 'E A', 'L'] },
  'flota.choferes':          { etiqueta: 'Choferes (sin documento)', fila: ['L', 'E', 'L', '—', 'L', 'L', 'E', 'L', 'E A', 'L'] },
  'flota.documento_chofer':  { etiqueta: 'Documento del chofer', fila: ['—', '—', '—', '—', '—', 'L', 'E', '—', 'E A', 'L'] },
  'flota.asignaciones':      { etiqueta: 'Asignaciones camión–chofer', fila: ['L', 'E', 'L', '—', 'L', 'L', 'L', '—', 'E A', 'L'] },
  'flota.dispositivos':      { etiqueta: 'Dispositivos de telemetría', fila: ['—', 'L', '—', '—', '—', 'L', '—', '—', 'E A', 'L'] },
  // Migración 60/61: módulo del chofer. El chofer entra con el rol de base tc_chofer, que solo ejecuta las funciones de
  // su módulo (la base filtra por su propio chofer). Por eso el chofer ya no tiene 'P' en las pantallas de la oficina.
  // TI no las ve: necesitan un usuario vinculado a un chofer.
  'chofer.mi_carga':         { etiqueta: 'Mi carga (chofer): documentos y ubicación', fila: ['—', '—', '—', 'P', '—', '—', '—', '—', '—', '—'] },
  'chofer.mis_gastos':       { etiqueta: 'Mis gastos y fondo (chofer)', fila: ['—', '—', '—', 'P', '—', '—', '—', '—', '—', '—'] },
  // Fondo fijo de los choferes: entregas, vueltos, revisión de gastos y cierre del período (la base exige RRHH, Finanzas o TI).
  'rrhh.fondos':             { etiqueta: 'Fondos y gastos de choferes', fila: ['L', 'L', '—', '—', '—', 'L', 'E A', 'E A', 'E A', 'L'] },
  'comercial.clientes':      { etiqueta: 'Clientes', fila: ['L', 'E', '—', '—', '—', '—', '—', 'E', 'E A', 'L'] },
  'comercial.ubicaciones':   { etiqueta: 'Ubicaciones y geocercas', fila: ['L', 'E', 'L', '—', 'L', 'L', '—', '—', 'E A', 'L'] },
  'comercial.proveedores':   { etiqueta: 'Proveedores y estaciones', fila: ['—', 'L', 'L', '—', 'E', 'L', '—', 'E', 'E A', 'L'] },
  'liquidacion.tramos':      { etiqueta: 'Tramos liquidables', fila: ['—', 'L', '—', '—', '—', '—', 'E A', 'L', 'E A', 'L'] },
  'liquidacion.liquidaciones': { etiqueta: 'Liquidaciones', fila: ['L', '—', '—', '—', '—', '—', 'E A', 'L A', 'E A', 'L'] },
  'liquidacion.reglas':      { etiqueta: 'Reglas de liquidación', fila: ['—', '—', '—', '—', '—', '—', 'E', 'L', 'E A', 'L'] },
  'finanzas.ingresos':       { etiqueta: 'Ingresos', fila: ['L', 'E', '—', '—', '—', '—', '—', 'E A', 'E A', 'L'] },
  'finanzas.costos_directos': { etiqueta: 'Costos directos', fila: ['L', 'E', '—', '—', 'E', '—', '—', 'E A', 'E A', 'L'] },
  'finanzas.costos_indirectos': { etiqueta: 'Costos indirectos, índices de ajuste', fila: ['L', '—', '—', '—', '—', '—', '—', 'E', 'E A', 'L'] },
  'finanzas.tipos_cambio':   { etiqueta: 'Tipos de cambio', fila: ['L', '—', '—', '—', 'L', '—', 'L', 'E', 'E A', 'L'] },
  'finanzas.rentabilidad':   { etiqueta: 'Asignación de costos y rentabilidad', fila: ['L', 'L', '—', '—', '—', '—', '—', 'L', 'E A', 'L'] },
  'finanzas.cierre':         { etiqueta: 'Cierre de período', fila: ['L', '—', '—', '—', '—', '—', '—', 'A', 'E A', 'L'] },
  'configuracion.catalogos': { etiqueta: 'Monedas, países, catálogos, parámetros', fila: ['L', 'L', '—', '—', 'L', 'L', 'L', 'L', 'E A', 'L'] },
  // Agregada con la migración 34: alta, roles y desactivación de usuarios. Solo TI (la base lo vuelve a exigir).
  'configuracion.usuarios':  { etiqueta: 'Usuarios y roles', fila: ['—', '—', '—', '—', '—', '—', '—', '—', 'E A', '—'] },
  'configuracion.politica_tc': { etiqueta: 'Política de tipo de cambio', fila: ['—', '—', '—', '—', '—', '—', '—', 'E', 'E A', 'L'] },
  'auditoria.bitacora':      { etiqueta: 'Bitácora de cambios', fila: ['—', '—', '—', '—', '—', '—', '—', '—', 'L', 'L'] },
  'auditoria.accesos':       { etiqueta: 'Accesos sensibles', fila: ['—', '—', '—', '—', '—', '—', '—', '—', '—', 'L'] },
  'auditoria.historial_alertas': { etiqueta: 'Historial de alertas', fila: ['—', '—', '—', '—', '—', 'L', '—', '—', 'L', 'L'] },
  'auditoria.usuarios':      { etiqueta: 'Usuarios', fila: ['—', '—', '—', '—', '—', '—', '—', '—', 'E', 'L'] },
  'auditoria.particiones':   { etiqueta: 'Mantenimiento de particiones', fila: ['—', '—', '—', '—', '—', '—', '—', '—', 'E', 'L'] },
} as const satisfies Record<string, { etiqueta: string; fila: Fila }>;

export type PantallaId = keyof typeof PANTALLAS;
export const IDS_PANTALLA = Object.keys(PANTALLAS) as PantallaId[];
