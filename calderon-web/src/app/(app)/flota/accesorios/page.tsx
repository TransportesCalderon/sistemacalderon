import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { Pestanas } from '@/shared/ui/pestanas';
import { PESTANAS_EQUIPOS } from '@/shared/ui/pestanas-secciones';
import { AccesoriosPantalla } from '@/modules/pizarra/components/accesorios';

export const metadata: Metadata = { title: 'Tipos de accesorio' };

/** Flota > Tipos de accesorio: las columnas de accesorios de la Pizarra (migración 39). */
export default async function Pagina() {
  await requirePermiso('flota.pizarra:ver');
  return (
    <>
      <Pestanas items={PESTANAS_EQUIPOS} />
      <AccesoriosPantalla />
    </>
  );
}
