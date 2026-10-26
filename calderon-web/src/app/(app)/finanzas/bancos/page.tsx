import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { BancosPantalla } from '@/modules/finanzas/components/bancos-pantalla';

export const metadata: Metadata = { title: 'Bancos y cajas' };

/** Finanzas › Bancos y cajas (migración 73). */
export default async function Pagina() {
  await requirePermiso('finanzas.bancos:ver');
  return <BancosPantalla />;
}
