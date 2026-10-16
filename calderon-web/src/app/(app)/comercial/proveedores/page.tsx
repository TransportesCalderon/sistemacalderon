import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { ProveedoresPantalla } from '@/modules/catalogos/components/proveedores';

export const metadata: Metadata = { title: 'Proveedores' };

/** Proveedores (migración 28). */
export default async function Pagina() {
  await requirePermiso('comercial.proveedores:ver');
  return <ProveedoresPantalla />;
}
