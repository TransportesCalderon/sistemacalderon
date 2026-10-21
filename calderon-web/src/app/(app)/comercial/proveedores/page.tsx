import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { Pestanas } from '@/shared/ui/pestanas';
import { PESTANAS_PROVEEDORES } from '@/shared/ui/pestanas-secciones';
import { ProveedoresPantalla } from '@/modules/catalogos/components/proveedores';

export const metadata: Metadata = { title: 'Proveedores' };

/** Proveedores (migración 28). */
export default async function Pagina() {
  await requirePermiso('comercial.proveedores:ver');
  return (
    <>
      <Pestanas items={PESTANAS_PROVEEDORES} />
      <ProveedoresPantalla />
    </>
  );
}
