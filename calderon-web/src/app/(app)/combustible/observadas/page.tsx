import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { Pestanas } from '@/shared/ui/pestanas';
import { PESTANAS_REVISAR } from '@/shared/ui/pestanas-secciones';
import { BandejaCargas } from '@/modules/combustible/components/cargas/bandejas';

export const metadata: Metadata = { title: 'Cargas por validar' };

/** Bandeja de cargas por validar (migración 34). ?estado=observada muestra solo las observadas. */
export default async function Pagina({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermiso('combustible.bandejas:ver');
  const { estado } = await searchParams;
  return (
    <>
      <Pestanas items={PESTANAS_REVISAR} />
      <BandejaCargas tipo={estado === 'observada' ? 'observadas' : 'por_validar'} />
    </>
  );
}
