import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { MisLiquidaciones } from '@/modules/liquidacion/components/mis-liquidaciones';

export const metadata: Metadata = { title: 'Mis liquidaciones' };

/** Chofer › Mis liquidaciones: aprobadas y pagadas (migración 62). */
export default async function Pagina() {
  await requirePermiso('chofer.mis_liquidaciones:ver');
  return <MisLiquidaciones />;
}
