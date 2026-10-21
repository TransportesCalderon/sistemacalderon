import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { DatosCamionesPantalla } from '@/modules/telemetria/components/datos-camiones';

export const metadata: Metadata = { title: 'Datos de los camiones' };

/** Configuración > Datos de los camiones: inventario de la telemetría, tarjetas sin enlazar y umbrales (migración 49). */
export default async function Pagina() {
  await requirePermiso('telemetria.calidad:ver');
  return <DatosCamionesPantalla />;
}
