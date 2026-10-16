import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { MonedasPantalla } from '@/modules/catalogos/components/monedas';

export const metadata: Metadata = { title: 'Monedas y moneda base' };

/** Monedas y moneda base (migración 29). */
export default async function Pagina() {
  await requirePermiso('configuracion.catalogos:ver');
  return <MonedasPantalla />;
}
