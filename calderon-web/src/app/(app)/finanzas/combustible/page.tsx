import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { CombustiblePantalla } from '@/modules/finanzas/components/combustible-pantalla';

export const metadata: Metadata = { title: 'Combustible en finanzas' };

/** Finanzas › Combustible (migración 74): reglas de pago y cargas por facturar. */
export default async function Pagina() {
  await requirePermiso('finanzas.gastos:ver');
  return <CombustiblePantalla />;
}
