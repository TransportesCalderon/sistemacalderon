import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { requireSession } from '@/modules/core/auth/guards';
import { aSesionCliente } from '@/modules/core/auth/session';
import { SessionProvider } from '@/modules/core/session/session-provider';

/**
 * Migración 288 · Lo que ve el usuario de un cliente: sin el menú ni los avisos de la plataforma, solo su
 * seguimiento. Cualquier otro usuario vuelve al inicio (el middleware ya manda al cliente acá).
 */
export default async function ClienteLayout({ children }: { children: ReactNode }) {
  const ctx = await requireSession();
  if (ctx.identidad.rolBd !== 'tc_cliente') redirect('/');
  return <SessionProvider value={aSesionCliente(ctx)}>{children}</SessionProvider>;
}
