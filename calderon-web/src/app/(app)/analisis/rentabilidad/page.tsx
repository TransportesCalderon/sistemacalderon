import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { RentabilidadPantalla } from '@/modules/finanzas/components/rentabilidad-pantalla';

export const metadata: Metadata = { title: 'Rentabilidad' };

/** IA-1 · Finanzas › Rentabilidad: margen de contribución por chofer, camión o viaje (migración 119). */
export default async function Pagina() {
  await requirePermiso('finanzas.rentabilidad:ver');
  return <RentabilidadPantalla />;
}
