/**
 * Roles de aplicación (especificación funcional §2) y roles de base de datos (DDL 09).
 * Los códigos coinciden con seg.rol_aplicacion.codigo (migración 02_conexion_api).
 */
export const ROLES_APP = [
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
  'comercial',
  // Migración 198: Mantenimiento
  'mantenimiento_jefe',
  'mecanico',
] as const;

export type RolApp = (typeof ROLES_APP)[number];

// Migración 288: tc_cliente, el usuario de un cliente (solo ve su mapa). Su rol de la aplicación («cliente») no va en
// ROLES_APP: no tiene pantallas ni permisos; la web lo reconoce por el rol de base.
export const ROLES_BD = ['tc_admin', 'tc_app', 'tc_lectura', 'tc_auditor', 'tc_chofer', 'tc_cliente'] as const;
export type RolBd = (typeof ROLES_BD)[number];

export const ETIQUETA_ROL: Record<RolApp, string> = {
  gerencia: 'Gerencia',
  operaciones: 'Operaciones',
  base_mendoza: 'Base Mendoza',
  chofer: 'Chofer',
  adm_combustible: 'Administración de combustible',
  analista_control: 'Analista de control',
  rrhh: 'Administración y RR. HH.',
  finanzas: 'Finanzas',
  ti: 'Administrador del sistema',
  auditor: 'Auditor',
  comercial: 'Ventas',
  mantenimiento_jefe: 'Jefe de mantenimiento',
  mecanico: 'Mecánico',
};
