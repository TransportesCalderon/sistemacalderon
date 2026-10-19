import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { FlotaPantalla } from '@/modules/telemetria/components/flota-pantalla';

export const metadata: Metadata = { title: 'Mapa de flota' };

/** Mapa de flota con la telemetría rFMS (migración 32). */
export default async function Pagina() {
  await requirePermiso('telemetria.mapa:ver');
  return <FlotaPantalla />;
}
