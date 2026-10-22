import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { FondosPantalla } from '@/modules/chofer/components/fondos-pantalla';
import { Pestanas } from '@/shared/ui/pestanas';
import { PESTANAS_RRHH } from '@/shared/ui/pestanas-secciones';

export const metadata: Metadata = { title: 'Fondos de choferes' };

/** Administración › Fondos de choferes: entregas, vueltos, gastos por revisar y cierre del período (migración 61). */
export default async function Pagina() {
  await requirePermiso('rrhh.fondos:ver');
  return (
    <>
      <Pestanas items={PESTANAS_RRHH} />
      <FondosPantalla />
    </>
  );
}
