import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { RalentiPantalla } from '@/modules/combustible/components/ralenti/ralenti-pantalla';

export const metadata: Metadata = { title: 'Ralentí del mes' };

/** Combustible > Ralentí del mes: permitido por chofer y descuento del exceso (migración 50). */
export default async function Pagina() {
  await requirePermiso('combustible.cierre_viaje:ver');
  return <RalentiPantalla />;
}
