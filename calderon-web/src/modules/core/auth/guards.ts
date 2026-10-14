import 'server-only';

import { redirect } from 'next/navigation';
import { can } from '@/modules/core/permissions/resolver';
import type { Permiso } from '@/modules/core/permissions/types';
import type { IdentidadNegocio } from './claims';
import { getSessionContext, type ContextoSesion } from './session';

export type ContextoAutenticado = ContextoSesion & { identidad: IdentidadNegocio };

/** Exige sesión y usuario vinculado; si no, redirige a /login o /sin-acceso. */
export async function requireSession(): Promise<ContextoAutenticado> {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');
  if (!ctx.identidad) redirect('/sin-acceso?motivo=vinculo');
  return ctx as ContextoAutenticado;
}

/** Exige además un permiso concreto (capa 3/4 de la arquitectura §7). */
export async function requirePermiso(permiso: Permiso): Promise<ContextoAutenticado> {
  const ctx = await requireSession();
  if (!can(ctx.permisos, permiso)) redirect('/sin-acceso?motivo=permiso');
  return ctx;
}
