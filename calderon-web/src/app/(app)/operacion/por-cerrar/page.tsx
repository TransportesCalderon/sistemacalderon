import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { PorCerrarPantalla } from '@/modules/logistica/components/por-cerrar';
import { Pestanas } from '@/shared/ui/pestanas';
import { PESTANAS_TRACTORES } from '@/shared/ui/pestanas-secciones';

export const metadata: Metadata = { title: 'Cierres por hacer' };

/** Viajes › Cierres por hacer: qué falta en cada viaje y aprobar varios de una vez (migración 63). */
export default async function Pagina() {
  await requirePermiso('operacion.tramos:ver');
  return (
    <>
      <Pestanas items={PESTANAS_TRACTORES} />
      <PorCerrarPantalla />
    </>
  );
}
