import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { Pestanas } from '@/shared/ui/pestanas';
import { PESTANAS_TRACTORES } from '@/shared/ui/pestanas-secciones';
import { CostosViajesPantalla } from '@/modules/logistica/components/costos-viaje';

export const metadata: Metadata = { title: 'Costos de viajes' };

/** Logística > Costos de viajes: costo de cada viaje de chofer (migración 51). */
export default async function Pagina() {
  await requirePermiso('finanzas.costos_directos:ver');
  return (
    <>
      <Pestanas items={PESTANAS_TRACTORES} />
      <CostosViajesPantalla />
    </>
  );
}
