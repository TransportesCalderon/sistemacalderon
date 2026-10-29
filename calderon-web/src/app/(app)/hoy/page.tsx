import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { HoyPantalla } from '@/modules/hoy/components/hoy-pantalla';

export const metadata: Metadata = { title: 'Hoy' };

/** Sprint 3 · «Hoy» (migración 116): lo que le toca a cada uno, en una sola lista. */
export default async function Pagina() {
  await requirePermiso('inicio.hoy:ver');
  return <HoyPantalla />;
}
