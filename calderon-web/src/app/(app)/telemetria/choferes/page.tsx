import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { PuntajeChoferesPantalla } from '@/modules/telemetria/components/puntaje-choferes';

export const metadata: Metadata = { title: 'Puntaje de choferes' };

/** Flota > Puntaje de choferes: conducción con la telemetría, solo informativo (migración 49). */
export default async function Pagina() {
  await requirePermiso('telemetria.sesiones:ver');
  return <PuntajeChoferesPantalla />;
}
