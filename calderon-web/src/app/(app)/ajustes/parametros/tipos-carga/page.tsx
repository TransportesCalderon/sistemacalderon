import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { Pestanas } from '@/shared/ui/pestanas';
import { PESTANAS_AJUSTES } from '@/shared/ui/pestanas-secciones';
import { TiposCargaPantalla } from '@/modules/catalogos/components/tipos-carga';

export const metadata: Metadata = { title: 'Tipos de carga' };

/** Migración 121 · Ajustes › Catálogos › Tipos de carga (la mercadería que se transporta). */
export default async function Pagina() {
  await requirePermiso('configuracion.catalogos:ver');
  return (
    <>
      <Pestanas items={PESTANAS_AJUSTES} />
      <TiposCargaPantalla />
    </>
  );
}
