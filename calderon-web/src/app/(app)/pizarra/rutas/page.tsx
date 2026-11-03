import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { RutasPantalla } from '@/modules/logistica/components/rutas/rutas-pantalla';

export const metadata: Metadata = { title: 'Rutas para choferes' };

/** Viajes › Rutas para choferes (migración 156): la ruta de cada operación abierta, aparte del detalle. */
export default async function Pagina() {
  await requirePermiso('operacion.rutas:ver');
  return <RutasPantalla />;
}
