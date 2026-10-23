import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { CotizacionesPantalla } from '@/modules/ventas/components/cotizaciones-pantalla';

export const metadata: Metadata = { title: 'Cotizaciones' };

/** Ventas › Cotizaciones (migración 67). */
export default async function Pagina() {
  await requirePermiso('ventas.cotizaciones:ver');
  return <CotizacionesPantalla />;
}
