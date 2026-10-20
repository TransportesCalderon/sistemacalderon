import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { Pestanas } from '@/shared/ui/pestanas';
import { PESTANAS_CONSUMO } from '@/shared/ui/pestanas-secciones';
import { ConciliacionPantalla } from '@/modules/combustible/components/consumo/conciliacion';

export const metadata: Metadata = { title: 'Cargado vs. motor' };

/** Cargado frente a consumo del motor, por viaje (migración 36). */
export default async function Pagina() {
  await requirePermiso('combustible.consumo:ver');
  return (
    <>
      <Pestanas items={PESTANAS_CONSUMO} />
      <ConciliacionPantalla />
    </>
  );
}
