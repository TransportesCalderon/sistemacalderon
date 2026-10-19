import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { TransportistasPantalla } from '@/modules/logistica/components/transportistas';

export const metadata: Metadata = { title: 'Transportistas externos' };

/** Operación > Transportistas externos (migración 41). */
export default async function Pagina() {
  await requirePermiso('operacion.servicios:ver');
  return <TransportistasPantalla />;
}
