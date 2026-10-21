import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { Pestanas } from '@/shared/ui/pestanas';
import { PESTANAS_CONSUMO } from '@/shared/ui/pestanas-secciones';
import { RalentiPantalla } from '@/modules/combustible/components/ralenti/ralenti-pantalla';

export const metadata: Metadata = { title: 'Ralentí del mes' };

/** Combustible > Ralentí del mes: permitido por chofer y descuento del exceso (migración 50). */
export default async function Pagina() {
  await requirePermiso('combustible.cierre_viaje:ver');
  return (
    <>
      <Pestanas items={PESTANAS_CONSUMO} />
      <RalentiPantalla />
    </>
  );
}
