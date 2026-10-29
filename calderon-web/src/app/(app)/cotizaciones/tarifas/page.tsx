import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { TarifasVentasPantalla } from '@/modules/ventas/components/tarifas-pantalla';
import { Pestanas } from '@/shared/ui/pestanas';
import { PESTANAS_COTIZACIONES } from '@/shared/ui/pestanas-secciones';

export const metadata: Metadata = { title: 'Tarifas y costos' };

/** Cotizaciones › Tarifas y costos (Sprint 7: antes /ventas/tarifas). */
export default async function Pagina() {
  await requirePermiso('ventas.tarifas:ver');
  return (
    <>
      <Pestanas items={PESTANAS_COTIZACIONES} />
      <TarifasVentasPantalla />
    </>
  );
}
