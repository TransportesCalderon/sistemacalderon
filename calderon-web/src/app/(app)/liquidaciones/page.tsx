import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { LiquidacionesPantalla } from '@/modules/liquidacion/components/liquidaciones-pantalla';
import { Pestanas } from '@/shared/ui/pestanas';
import { PESTANAS_LIQUIDACIONES } from '@/shared/ui/pestanas-secciones';

export const metadata: Metadata = { title: 'Liquidaciones' };

/** Liquidaciones › Liquidaciones: preparar, revisar, aprobar y pagar (migración 62; Sprint 7: antes /rrhh/liquidaciones). */
export default async function Pagina() {
  await requirePermiso('liquidacion.liquidaciones:ver');
  return (
    <>
      <Pestanas items={PESTANAS_LIQUIDACIONES} />
      <LiquidacionesPantalla />
    </>
  );
}
