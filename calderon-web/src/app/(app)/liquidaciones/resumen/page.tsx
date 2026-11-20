import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { ResumenLiquidacionPantalla } from '@/modules/chofer/components/resumen-liquidacion';
import { Pestanas } from '@/shared/ui/pestanas';
import { PESTANAS_LIQUIDACIONES } from '@/shared/ui/pestanas-secciones';

export const metadata: Metadata = { title: 'Datos para liquidar' };

/** Liquidaciones › Datos para liquidar (antes «Resumen para liquidar»; 20/11/2026): por chofer y período del 26 al 25 (migración 61; Sprint 7: antes /rrhh/liquidacion). */
export default async function Pagina() {
  await requirePermiso('liquidacion.liquidaciones:ver');
  return (
    <>
      <Pestanas items={PESTANAS_LIQUIDACIONES} />
      <ResumenLiquidacionPantalla />
    </>
  );
}
