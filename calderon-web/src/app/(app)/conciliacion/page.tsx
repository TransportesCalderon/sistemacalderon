import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { BancosPantalla } from '@/modules/finanzas/components/bancos-pantalla';

export const metadata: Metadata = { title: 'Conciliación' };

/** Conciliación: bancos, cajas y su cartola (migración 73; Sprint 7: antes /finanzas/bancos). */
export default async function Pagina() {
  await requirePermiso('finanzas.bancos:ver');
  return <BancosPantalla />;
}
