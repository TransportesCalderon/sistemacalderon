import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { TractoresPantalla } from '@/modules/logistica/components/tractores-pantalla';

export const metadata: Metadata = { title: 'Tractores y viajes' };

/** Logística > Tractores y viajes (migración 46): chofer fijo de cada tractor e inicio del viaje de chofer. */
export default async function Pagina() {
  await requirePermiso('operacion.tramos:ver');
  return <TractoresPantalla />;
}
