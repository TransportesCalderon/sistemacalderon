import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { PizarraPantalla } from '@/modules/pizarra/components/pizarra-pantalla';

export const metadata: Metadata = { title: 'Pizarra Azul' };

/** Flota > Pizarra Azul (migración 39): reemplaza la planilla PIZARRA SEMI GENSET. */
export default async function Pagina() {
  await requirePermiso('flota.pizarra:ver');
  return <PizarraPantalla />;
}
