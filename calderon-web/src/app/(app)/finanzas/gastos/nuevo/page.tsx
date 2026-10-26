import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { GastoFicha } from '@/modules/finanzas/components/gasto-ficha';

export const metadata: Metadata = { title: 'Nuevo gasto' };

/** Finanzas › Gastos › nuevo (migración 73). */
export default async function Pagina() {
  await requirePermiso('finanzas.gastos:editar');
  return <GastoFicha id={null} />;
}
