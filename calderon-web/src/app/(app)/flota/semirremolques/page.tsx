import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { SemisPantalla } from '@/modules/pizarra/components/semis';

export const metadata: Metadata = { title: 'Semirremolques' };

/** Flota > Semirremolques (cada uno es una fila de la Pizarra Azul). */
export default async function Pagina() {
  await requirePermiso('flota.camiones:ver');
  return <SemisPantalla />;
}
