import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { InformesPantalla } from '@/modules/finanzas/components/informes-pantalla';

export const metadata: Metadata = { title: 'Informes financieros' };

/** Finanzas › Informes (migración 73). */
export default async function Pagina() {
  await requirePermiso('finanzas.informes:ver');
  return <InformesPantalla />;
}
