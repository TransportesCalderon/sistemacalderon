import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { ResumenLiquidacionPantalla } from '@/modules/chofer/components/resumen-liquidacion';
import { Pestanas } from '@/shared/ui/pestanas';
import { PESTANAS_LIQUIDACIONES } from '@/shared/ui/pestanas-secciones';

export const metadata: Metadata = { title: 'Resumen para liquidar' };

/** Liquidaciones › Resumen para liquidar: por chofer y período del 26 al 25 (migración 61; Sprint 7: antes /rrhh/liquidacion). */
export default async function Pagina() {
  await requirePermiso('liquidacion.liquidaciones:ver');
  return (
    <>
      <Pestanas items={PESTANAS_LIQUIDACIONES} />
      <ResumenLiquidacionPantalla />
    </>
  );
}
