import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { GastosPantalla } from '@/modules/finanzas/components/gastos-pantalla';

export const metadata: Metadata = { title: 'Gastos' };

/** Finanzas › Gastos (migración 73). */
export default async function Pagina() {
  await requirePermiso('finanzas.gastos:ver');
  return <GastosPantalla />;
}
