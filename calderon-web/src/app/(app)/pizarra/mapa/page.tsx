import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { PizarraPantalla } from '@/modules/pizarra/components/pizarra-pantalla';

export const metadata: Metadata = { title: 'Mapa de flota' };

/** Mapa de flota: la vista Mapa de la Pizarra, con su propia entrada en el menú y en la barra (antes /telemetria/mapa). */
export default async function Pagina() {
  await requirePermiso('telemetria.mapa:ver');
  return <PizarraPantalla vista="mapa" />;
}
