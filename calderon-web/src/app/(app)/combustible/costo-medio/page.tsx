import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { ConsumoCamionesPantalla } from '@/modules/combustible/components/consumo/consumo-camiones';

export const metadata: Metadata = { title: 'Consumo y costo por camión' };

/** Consumo y costo por camión (migración 36). */
export default async function Pagina() {
  await requirePermiso('combustible.consumo:ver');
  return <ConsumoCamionesPantalla />;
}
