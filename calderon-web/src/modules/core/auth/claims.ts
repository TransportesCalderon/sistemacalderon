import { ROLES_APP, ROLES_BD, type RolApp, type RolBd } from '@/modules/core/permissions/roles';

/**
 * Claims que agrega el hook seg.fn_custom_access_token (migración 02_conexion_api).
 * Un usuario sin vínculo en seg.usuario, o con el hook desactivado, no los trae.
 */
export interface ClaimsCalderon {
  sub: string;
  email?: string;
  usuario_id?: number;
  roles_app?: string[];
  rol_bd?: string;
  chofer_id?: number;
}

export interface IdentidadNegocio {
  usuarioId: number;
  rolesApp: RolApp[];
  rolBd: RolBd | null;
  choferId: number | null;
}

/** Decodifica el payload de un JWT sin verificar la firma (el token ya fue validado por getUser()). */
export function decodificarClaims(token: string): ClaimsCalderon | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const relleno = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const texto = new TextDecoder().decode(Uint8Array.from(atob(relleno), (c) => c.charCodeAt(0)));
    return JSON.parse(texto) as ClaimsCalderon;
  } catch {
    return null;
  }
}

/** Extrae la identidad de negocio de los claims; null si el usuario no está vinculado. */
export function identidadDesdeClaims(claims: ClaimsCalderon | null): IdentidadNegocio | null {
  if (!claims || typeof claims.usuario_id !== 'number') return null;
  const rolesApp = (claims.roles_app ?? []).filter((r): r is RolApp => (ROLES_APP as readonly string[]).includes(r));
  const rolBd = claims.rol_bd && (ROLES_BD as readonly string[]).includes(claims.rol_bd) ? (claims.rol_bd as RolBd) : null;
  return {
    usuarioId: claims.usuario_id,
    rolesApp,
    rolBd,
    choferId: typeof claims.chofer_id === 'number' ? claims.chofer_id : null,
  };
}
