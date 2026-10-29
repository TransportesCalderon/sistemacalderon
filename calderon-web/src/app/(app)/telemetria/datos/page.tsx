import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { Pestanas } from '@/shared/ui/pestanas';
import { PESTANAS_INTEGRACIONES } from '@/shared/ui/pestanas-secciones';
import { DatosCamionesPantalla } from '@/modules/telemetria/components/datos-camiones';

export const metadata: Metadata = { title: 'Datos de los camiones' };

/** Configuración > Datos de los camiones: inventario de la telemetría, tarjetas sin enlazar y umbrales (migración 49). */
export default async function Pagina() {
  await requirePermiso('telemetria.calidad:ver');
  return (
    <>
      <Pestanas items={PESTANAS_INTEGRACIONES} />
      <DatosCamionesPantalla />
    </>
  );
}
