import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { UsuariosPantalla } from '@/modules/usuarios/components/usuarios-pantalla';

export const metadata: Metadata = { title: 'Usuarios y roles' };

/** Usuarios y roles (migración 34). Solo TI. */
export default async function Pagina() {
  await requirePermiso('configuracion.usuarios:ver');
  return <UsuariosPantalla />;
}
