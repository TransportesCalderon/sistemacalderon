import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { TarifasPantalla } from '@/modules/liquidacion/components/tarifas-pantalla';
import { Pestanas } from '@/shared/ui/pestanas';
import { PESTANAS_RRHH } from '@/shared/ui/pestanas-secciones';

export const metadata: Metadata = { title: 'Tarifas y conceptos' };

/** Administración › Tarifas y conceptos de la liquidación (migración 62). */
export default async function Pagina() {
  await requirePermiso('liquidacion.reglas:ver');
  return (
    <>
      <Pestanas items={PESTANAS_RRHH} />
      <TarifasPantalla />
    </>
  );
}
