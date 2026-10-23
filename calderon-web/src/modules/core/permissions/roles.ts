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
] as const;

export type RolApp = (typeof ROLES_APP)[number];

export const ROLES_BD = ['tc_admin', 'tc_app', 'tc_lectura', 'tc_auditor', 'tc_chofer'] as const;
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
};
