import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { Pestanas } from '@/shared/ui/pestanas';
import { PESTANAS_INTEGRACIONES } from '@/shared/ui/pestanas-secciones';
import { EquiposTrackerwayPantalla } from '@/modules/telemetria/components/equipos-trackerway';

export const metadata: Metadata = { title: 'Equipos GPS' };

/** Configuración > Equipos GPS: equipos Teltonika de Trackerway, enlace y cuáles se traen (migración 72). */
export default async function Pagina() {
  await requirePermiso('telemetria.calidad:ver');
  return (
    <>
      <Pestanas items={PESTANAS_INTEGRACIONES} />
      <EquiposTrackerwayPantalla />
    </>
  );
}
