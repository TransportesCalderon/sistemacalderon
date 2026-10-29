import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { CotizacionesPantalla } from '@/modules/ventas/components/cotizaciones-pantalla';
import { Pestanas } from '@/shared/ui/pestanas';
import { PESTANAS_COTIZACIONES } from '@/shared/ui/pestanas-secciones';

export const metadata: Metadata = { title: 'Cotizaciones' };

/** Cotizaciones (Sprint 7: antes Ventas › Cotizaciones; los clientes y las tarifas son pestañas). */
export default async function Pagina() {
  await requirePermiso('ventas.cotizaciones:ver');
  return (
    <>
      <Pestanas items={PESTANAS_COTIZACIONES} />
      <CotizacionesPantalla />
    </>
  );
}
