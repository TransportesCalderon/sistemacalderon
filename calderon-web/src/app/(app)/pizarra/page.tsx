import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { PizarraPantalla } from '@/modules/pizarra/components/pizarra-pantalla';

export const metadata: Metadata = { title: 'Pizarra Azul' };

/** Pizarra Azul (migración 39; Sprint 5: pasa de /flota/pizarra a /pizarra, el centro operativo). */
export default async function Pagina() {
  await requirePermiso('flota.pizarra:ver');
  return <PizarraPantalla />;
}
