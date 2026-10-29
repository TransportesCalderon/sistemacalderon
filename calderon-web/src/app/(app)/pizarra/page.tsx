import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requirePermiso } from '@/modules/core/auth/guards';
import { PizarraPantalla } from '@/modules/pizarra/components/pizarra-pantalla';

export const metadata: Metadata = { title: 'Pizarra Azul' };

type Props = { searchParams: Promise<{ vista?: string }> };

/** Pizarra Azul (migración 39; Sprint 5: pasa de /flota/pizarra a /pizarra, el centro operativo). */
export default async function Pagina({ searchParams }: Props) {
  // Enlaces guardados del Sprint 6 (?vista=mapa): el mapa ahora tiene su dirección propia
  if ((await searchParams).vista === 'mapa') redirect('/pizarra/mapa');
  await requirePermiso('flota.pizarra:ver');
  return <PizarraPantalla />;
}
