import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { AlertasPantalla } from '@/modules/anomalias/components/alertas-pantalla';

export const metadata: Metadata = { title: 'Alertas' };

/** Combustible > Alertas: bandeja del motor de anomalías con la telemetría (migración 49). */
export default async function Pagina() {
  await requirePermiso('anomalias.alertas:ver');
  return <AlertasPantalla />;
}
