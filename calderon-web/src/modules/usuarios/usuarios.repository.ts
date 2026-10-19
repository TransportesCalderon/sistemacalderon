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
      ultimoIngreso: u.ultimo_ingreso as FechaISO | null,
    }));
  },
  async sinVincular(): Promise<CuentaSinVincular[]> {
    const { data, error } = await db.schema('seg').rpc('fn_cuentas_sin_vincular');
    if (error) throw new RepoError(error);
    return (data ?? []).map((c) => ({ email: c.email, creadaEn: c.creada_en as FechaISO }));
  },
  async guardar(d: { email: string; nombre: string; roles: string[]; activo: boolean }): Promise<number> {
    const { data, error } = await db
      .schema('seg')
      .rpc('fn_guardar_usuario', { p_email: d.email, p_nombre: d.nombre, p_roles: d.roles, p_activo: d.activo });
    if (error) throw new RepoError(error);
    return data as number;
  },
});
