import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { Pestanas } from '@/shared/ui/pestanas';
import { PESTANAS_MONEDAS } from '@/shared/ui/pestanas-secciones';
import { MonedasPantalla } from '@/modules/catalogos/components/monedas';

export const metadata: Metadata = { title: 'Monedas y moneda base' };

/** Monedas y moneda base (migración 29). */
export default async function Pagina() {
  await requirePermiso('configuracion.catalogos:ver');
  return (
    <>
      <Pestanas items={PESTANAS_MONEDAS} />
      <MonedasPantalla />
    </>
  );
}
