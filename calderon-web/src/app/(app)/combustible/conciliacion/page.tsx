import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { ConciliacionPantalla } from '@/modules/combustible/components/consumo/conciliacion';

export const metadata: Metadata = { title: 'Cargado vs. motor' };

/** Cargado frente a consumo del motor, por viaje (migración 36). */
export default async function Pagina() {
  await requirePermiso('combustible.consumo:ver');
  return <ConciliacionPantalla />;
}
