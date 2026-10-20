import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { Pestanas } from '@/shared/ui/pestanas';
import { PESTANAS_CONSUMO } from '@/shared/ui/pestanas-secciones';
import { ConsumoCamionesPantalla } from '@/modules/combustible/components/consumo/consumo-camiones';

export const metadata: Metadata = { title: 'Consumo y costo por camión' };

/** Consumo y costo por camión (migración 36). */
export default async function Pagina() {
  await requirePermiso('combustible.consumo:ver');
  return (
    <>
      <Pestanas items={PESTANAS_CONSUMO} />
      <ConsumoCamionesPantalla />
    </>
  );
}
