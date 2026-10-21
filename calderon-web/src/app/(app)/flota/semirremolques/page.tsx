import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { Pestanas } from '@/shared/ui/pestanas';
import { PESTANAS_EQUIPOS } from '@/shared/ui/pestanas-secciones';
import { SemisPantalla } from '@/modules/pizarra/components/semis';

export const metadata: Metadata = { title: 'Semirremolques' };

/** Flota > Semirremolques (cada uno es una fila de la Pizarra Azul). */
export default async function Pagina() {
  await requirePermiso('flota.camiones:ver');
  return (
    <>
      <Pestanas items={PESTANAS_EQUIPOS} />
      <SemisPantalla />
    </>
  );
}
