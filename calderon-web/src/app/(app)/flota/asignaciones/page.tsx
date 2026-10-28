import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { AsignacionesPantalla } from '@/modules/logistica/components/asignaciones-pantalla';

export const metadata: Metadata = { title: 'Choferes de los tractores' };

/** Flota › Choferes de los tractores: el chofer fijo de cada tractor, en una sola lista (migración 109). */
export default async function Pagina() {
  await requirePermiso('flota.asignaciones:ver');
  return <AsignacionesPantalla />;
}
