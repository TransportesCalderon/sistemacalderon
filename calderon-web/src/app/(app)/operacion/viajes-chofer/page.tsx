import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { ViajesChoferLista } from '@/modules/logistica/components/viajes-chofer-lista';

export const metadata: Metadata = { title: 'Viajes de chofer' };

/** Logística > Tractores y viajes > Viajes de chofer (migración 46). */
export default async function Pagina() {
  await requirePermiso('operacion.tramos:ver');
  return <ViajesChoferLista />;
}
