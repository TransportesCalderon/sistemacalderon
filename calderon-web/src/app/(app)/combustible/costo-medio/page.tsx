import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { Pestanas } from '@/shared/ui/pestanas';
import { PESTANAS_CONSUMO } from '@/shared/ui/pestanas-secciones';
import { ConsumoCamionesPantalla } from '@/modules/combustible/components/consumo/consumo-camiones';
import { ConsumoRutasPantalla } from '@/modules/combustible/components/consumo/consumo-rutas';

export const metadata: Metadata = { title: 'Consumo y costo por camión' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Consumo y costo por camión (migración 36); migración 223: «Consumo por ruta» como vista de esta pantalla. */
export default async function Pagina({ searchParams }: Props) {
  await requirePermiso('combustible.consumo:ver');
  const sp = await searchParams;
  return (
    <>
      <Pestanas items={PESTANAS_CONSUMO} />
      {sp.vista === 'rutas' ? <ConsumoRutasPantalla /> : <ConsumoCamionesPantalla />}
    </>
  );
}
