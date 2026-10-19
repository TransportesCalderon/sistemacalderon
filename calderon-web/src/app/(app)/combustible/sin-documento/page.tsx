import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { BandejaCargas } from '@/modules/combustible/components/cargas/bandejas';

export const metadata: Metadata = { title: 'Cargas sin ticket' };

/** Bandeja de cargas sin ticket adjunto (migración 34). */
export default async function Pagina() {
  await requirePermiso('combustible.bandejas:ver');
  return <BandejaCargas tipo="sin_documento" />;
}
