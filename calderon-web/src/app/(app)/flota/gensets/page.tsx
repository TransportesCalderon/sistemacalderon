import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { GensetsPantalla } from '@/modules/pizarra/components/gensets';

export const metadata: Metadata = { title: 'Gensets' };

/** Flota > Gensets e instalación en los semis (migración 39). */
export default async function Pagina() {
  await requirePermiso('flota.pizarra:ver');
  return <GensetsPantalla />;
}
