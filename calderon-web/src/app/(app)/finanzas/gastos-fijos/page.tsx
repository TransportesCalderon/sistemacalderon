import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { GastosFijosPantalla } from '@/modules/finanzas/components/gastos-fijos-pantalla';

export const metadata: Metadata = { title: 'Gastos fijos' };

/** Finanzas › Gastos fijos (migración 73). */
export default async function Pagina() {
  await requirePermiso('finanzas.gastos:ver');
  return <GastosFijosPantalla />;
}
