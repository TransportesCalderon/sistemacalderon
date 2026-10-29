import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { ActasPantalla } from '@/modules/actas/components/actas-pantalla';

export const metadata: Metadata = { title: 'Actas de infracción' };

/** Migración 122 · Alertas › Actas de infracción (consumo excesivo, daños en la unidad, velocidad excesiva). */
export default async function Pagina() {
  await requirePermiso('operacion.actas:ver');
  return <ActasPantalla />;
}
