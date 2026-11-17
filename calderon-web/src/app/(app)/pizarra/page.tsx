import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requirePermiso } from '@/modules/core/auth/guards';
import { PizarraPantalla } from '@/modules/pizarra/components/pizarra-pantalla';
import { LibroSalidas } from '@/modules/pizarra/components/libro-salidas';
import { AvisoOperacionesIncompletas } from '@/modules/hoy/components/aviso-operaciones-incompletas';

export const metadata: Metadata = { title: 'Pizarra Azul' };

type Props = { searchParams: Promise<{ vista?: string }> };

/** Pizarra Azul (migración 39; Sprint 5: pasa de /flota/pizarra a /pizarra, el centro operativo). */
export default async function Pagina({ searchParams }: Props) {
  // Enlaces guardados del Sprint 6 (?vista=mapa): el mapa ahora tiene su dirección propia
  const { vista } = await searchParams;
  if (vista === 'mapa') redirect('/pizarra/mapa');
  await requirePermiso('flota.pizarra:ver');
  // Migración 196: el libro de salidas de la base es una vista de la Pizarra
  if (vista === 'salidas') return <LibroSalidas />;
  return (
    <div className="space-y-4">
      <AvisoOperacionesIncompletas />
      <PizarraPantalla />
    </div>
  );
}
