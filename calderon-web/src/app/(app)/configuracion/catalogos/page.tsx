import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { Pestanas } from '@/shared/ui/pestanas';
import { PESTANAS_AJUSTES } from '@/shared/ui/pestanas-secciones';
import { CatalogosInicio } from '@/modules/catalogos/components/inicio';

export const metadata: Metadata = { title: 'Catálogos' };

/** Catálogos (migración 28). */
export default async function Pagina() {
  await requirePermiso('configuracion.catalogos:ver');
  return (
    <>
      <Pestanas items={PESTANAS_AJUSTES} />
      <CatalogosInicio />
    </>
  );
}
