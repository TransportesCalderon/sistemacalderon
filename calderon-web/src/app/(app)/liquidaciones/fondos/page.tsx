import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { FondosPantalla } from '@/modules/chofer/components/fondos-pantalla';
import { Pestanas } from '@/shared/ui/pestanas';
import { PESTANAS_LIQUIDACIONES } from '@/shared/ui/pestanas-secciones';

export const metadata: Metadata = { title: 'Fondos de choferes' };

/** Liquidaciones › Fondos de choferes: entregas, vueltos, gastos por revisar y cierre del período (migración 61; Sprint 7: antes /rrhh/fondos). */
export default async function Pagina() {
  await requirePermiso('rrhh.fondos:ver');
  return (
    <>
      <Pestanas items={PESTANAS_LIQUIDACIONES} />
      <FondosPantalla />
    </>
  );
}
