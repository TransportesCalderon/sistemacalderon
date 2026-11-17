import type { RolApp, RolBd } from './roles';

/**
 * S4 · Mapa de permisos (16/11/2026): lo que la base de verdad deja hacer, para no mostrar botones
 * que siempre terminan en error. Solo oculta; nunca muestra algo que la matriz no muestre, y la base
 * sigue decidiendo. Sale de la consulta 15 (quién puede ejecutar cada función) y del control de rol
 * que hace cada función por dentro. Si la base cambia, se ajusta acá.
 *
 *  - bd: roles de base que pueden ejecutar la función (el usuario entra con uno solo).
 *  - roles: roles de aplicación que la función deja pasar (alcanza con tener uno).
 * Las que además dependen de una marca de la persona (aprueba cierres, autoriza cargas…) o de ser
 * responsable solo llevan bd: esa parte la sigue decidiendo la base.
 */
export interface ReglaBase {
  bd?: readonly RolBd[];
  roles?: readonly RolApp[];
}

/** tc_admin y tc_app: los que escriben en casi todo. */
const ESCRIBEN: readonly RolBd[] = ['tc_admin', 'tc_app'];
/** Además Gerencia (tc_lectura), en las pocas funciones que se lo permiten. */
const CON_GERENCIA: readonly RolBd[] = ['tc_admin', 'tc_app', 'tc_lectura'];
const MANTENIMIENTO: readonly RolApp[] = ['mecanico', 'mantenimiento_jefe', 'ti'];

export const BASE_DEJA = {
  // Alertas (ana.fn_exigir_gestor, prórrogas y escalamientos dependen además de la marca)
  gestionarAlerta: { bd: CON_GERENCIA },
  cambiarResponsableAlerta: { bd: CON_GERENCIA, roles: ['gerencia', 'ti'] },
  // Catálogos
  guardarTipoCarga: { bd: ESCRIBEN, roles: ['gerencia', 'ti'] },
  correoEstacion: { bd: CON_GERENCIA },
  // Cierres de viaje
  aprobarCierre: { bd: CON_GERENCIA },
  cerrarYAprobar: { bd: ESCRIBEN },
  decidirDiferencia: { bd: CON_GERENCIA, roles: ['analista_control', 'adm_combustible', 'operaciones', 'ti'] },
  pedirQuitarDescuento: { bd: CON_GERENCIA, roles: ['analista_control', 'adm_combustible', 'operaciones', 'rrhh', 'gerencia', 'ti'] },
  resolverQuitarDescuento: { bd: CON_GERENCIA },
  // Comité y consumo de choferes
  revisarEquipoMes: { bd: CON_GERENCIA, roles: ['gerencia', 'operaciones', 'analista_control', 'adm_combustible', 'ti'] },
  cerrarComite: { bd: CON_GERENCIA, roles: ['gerencia', 'ti'] },
  consumoChoferes: { bd: ESCRIBEN, roles: ['analista_control', 'gerencia', 'adm_combustible', 'ti'] },
  // Órdenes de carga (crear, aprobar, rechazar y anular dependen además de «Autoriza cargas»)
  ordenesCarga: { bd: CON_GERENCIA },
  revisarOrdenCarga: { bd: CON_GERENCIA, roles: ['gerencia', 'analista_control', 'ti'] },
  // Flota y mantenimiento
  revelarDocumentoChofer: { bd: ESCRIBEN },
  crearOt: { bd: CON_GERENCIA, roles: ['gerencia', 'operaciones', 'analista_control', 'mantenimiento_jefe', 'ti'] },
  asignarOt: { bd: ESCRIBEN, roles: MANTENIMIENTO },
  trabajarOt: { bd: ESCRIBEN, roles: MANTENIMIENTO },
  verificarOt: { bd: ESCRIBEN, roles: ['mantenimiento_jefe', 'ti'] },
  insumosOt: { bd: ESCRIBEN, roles: MANTENIMIENTO },
  // Liquidaciones
  resolverLiquidacion: { bd: ESCRIBEN, roles: ['rrhh', 'ti'] },
  // Operación y telemetría
  marcarConforme: { bd: ESCRIBEN, roles: ['operaciones', 'finanzas', 'ti'] },
  avisoVisto: { bd: CON_GERENCIA },
  registrarSeguimiento: { bd: ESCRIBEN, roles: ['analista_control', 'ti'] },
  pedirCarga: { bd: ESCRIBEN, roles: ['analista_control', 'ti'] },
  // Lecturas
  loMioDeHoy: { bd: CON_GERENCIA },
  tableroPendienteChofer: { bd: ESCRIBEN },
} as const satisfies Record<string, ReglaBase>;

export type AccionBase = keyof typeof BASE_DEJA;

/**
 * ¿La base deja hacer esto a este usuario? Sin rol de base conocido (claims viejos) no oculta nada:
 * mejor un error de la base que esconder algo que sí anda.
 */
export function baseDeja(regla: ReglaBase, rolBd: RolBd | null, roles: readonly RolApp[]): boolean {
  const { bd, roles: permitidos } = regla;
  if (bd && rolBd && !bd.includes(rolBd)) return false;
  if (permitidos && !roles.some((r) => permitidos.includes(r))) return false;
  return true;
}
