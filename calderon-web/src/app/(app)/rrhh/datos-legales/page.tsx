import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { DatosLegalesPantalla } from '@/modules/liquidacion/components/datos-legales-pantalla';
import { Pestanas } from '@/shared/ui/pestanas';
import { PESTANAS_RRHH } from '@/shared/ui/pestanas-secciones';

export const metadata: Metadata = { title: 'Datos legales' };

/** Administración › Datos legales para la liquidación de sueldo de Chile (migración 66). */
export default async function Pagina() {
  await requirePermiso('liquidacion.reglas:ver');
  return (
    <>
      <Pestanas items={PESTANAS_RRHH} />
      <DatosLegalesPantalla />
    </>
  );
}
