import { RepoError, type Db } from '@/shared/repository/types';
import type { FechaISO } from '@/shared/types/dominio';
import { ROLES_APP, type RolApp } from '@/modules/core/permissions/roles';

/** Usuarios y roles (seg, migración 34). Solo TI: la base lo controla en cada función. */
export interface Usuario {
  id: number;
  nombre: string;
  email: string | null;
  activo: boolean;
  roles: RolApp[];
  choferId: number | null;
  ultimoIngreso: FechaISO | null;
}

export interface CuentaSinVincular {
  email: string;
  creadaEn: FechaISO;
}

const esRol = (r: string): r is RolApp => (ROLES_APP as readonly string[]).includes(r);

export const usuariosRepository = (db: Db) => ({
  async listar(): Promise<Usuario[]> {
    const { data, error } = await db.schema('seg').rpc('fn_usuarios');
    if (error) throw new RepoError(error);
    return (data ?? []).map((u) => ({
      id: u.id,
      nombre: u.nombre,
      email: u.email,
      activo: u.activo,
      roles: (u.roles ?? []).filter(esRol),
      choferId: u.chofer_id,
      ultimoIngreso: u.ultimo_ingreso as FechaISO | null,
    }));
  },
  /** Migración 170: ids de quienes aprueban cierres de viaje. */
  async aprobadoresCierre(): Promise<number[]> {
    const { data, error } = await db.schema('seg').rpc('fn_aprobadores_cierre');
    if (error) throw new RepoError(error);
    return (data ?? []).map(Number);
  },
  async marcarAprobadorCierre(usuario: number, aprueba: boolean): Promise<void> {
    const { error } = await db.schema('seg').rpc('fn_marcar_aprobador_cierre', { p_usuario: usuario, p_aprueba: aprueba });
    if (error) throw new RepoError(error);
  },
  /** Migración 177: ids de quienes reciben el aviso de tanque bajo (además de Telemetría). */
  async avisadosTanqueBajo(): Promise<number[]> {
    const { data, error } = await db.schema('seg').rpc('fn_avisados_tanque_bajo');
    if (error) throw new RepoError(error);
    return (data ?? []).map(Number);
  },
  async marcarAvisoTanqueBajo(usuario: number, recibe: boolean): Promise<void> {
    const { error } = await db.schema('seg').rpc('fn_marcar_aviso_tanque_bajo', { p_usuario: usuario, p_recibe: recibe });
    if (error) throw new RepoError(error);
  },
  /** Migración 189: ids de quienes reciben las alertas vencidas (escalamiento) y resuelven prórrogas. */
  async recibenEscalamiento(): Promise<number[]> {
    const { data, error } = await db.schema('seg').rpc('fn_reciben_escalamiento');
    if (error) throw new RepoError(error);
    return (data ?? []).map(Number);
  },
  async marcarRecibeEscalamiento(usuario: number, recibe: boolean): Promise<void> {
    const { error } = await db.schema('seg').rpc('fn_marcar_recibe_escalamiento', { p_usuario: usuario, p_recibe: recibe });
    if (error) throw new RepoError(error);
  },
  async sinVincular(): Promise<CuentaSinVincular[]> {
    const { data, error } = await db.schema('seg').rpc('fn_cuentas_sin_vincular');
    if (error) throw new RepoError(error);
    return (data ?? []).map((c) => ({ email: c.email, creadaEn: c.creada_en as FechaISO }));
  },
  /** Migración 150: TI crea la cuenta de acceso y el usuario desde la plataforma. */
  async crear(d: { email: string; nombre: string; roles: string[]; choferId: number | null; clave: string | null }): Promise<number> {
    const { data, error } = await db.schema('seg').rpc('fn_crear_usuario', {
      p_email: d.email,
      p_nombre: d.nombre,
      p_roles: d.roles,
      p_activo: true,
      p_chofer: d.choferId,
      p_clave: d.clave || null,
    });
    if (error) throw new RepoError(error);
    return data as number;
  },
  async guardar(d: { email: string; nombre: string; roles: string[]; activo: boolean; choferId: number | null }): Promise<number> {
    const { data, error } = await db
      .schema('seg')
      .rpc('fn_guardar_usuario', { p_email: d.email, p_nombre: d.nombre, p_roles: d.roles, p_activo: d.activo, p_chofer: d.choferId });
    if (error) throw new RepoError(error);
    return data as number;
  },
});
