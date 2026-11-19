import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { ComprasPantalla } from '@/modules/finanzas/components/compras-pantalla';
import { GastosPantalla } from '@/modules/finanzas/components/gastos-pantalla';

export const metadata: Metadata = { title: 'Gastos' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Finanzas › Gastos (migración 73). Migración 280: la pestaña Compras (?vista=compras) es una vista de la misma página. */
export default async function Pagina({ searchParams }: Props) {
  await requirePermiso('finanzas.gastos:ver');
  const sp = await searchParams;
  return sp.vista === 'compras' ? <ComprasPantalla /> : <GastosPantalla />;
}
