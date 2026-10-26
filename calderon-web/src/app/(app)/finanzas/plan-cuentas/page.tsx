import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { PlanCuentasPantalla } from '@/modules/finanzas/components/plan-cuentas-pantalla';

export const metadata: Metadata = { title: 'Plan de cuentas' };

/** Finanzas › Plan de cuentas (migración 73). */
export default async function Pagina() {
  await requirePermiso('finanzas.plan_cuentas:ver');
  return <PlanCuentasPantalla />;
}
