import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { TarifasVentasPantalla } from '@/modules/ventas/components/tarifas-pantalla';

export const metadata: Metadata = { title: 'Tarifas y costos' };

/** Ventas › Tarifas y costos (migración 67). */
export default async function Pagina() {
  await requirePermiso('ventas.tarifas:ver');
  return <TarifasVentasPantalla />;
}
