import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { AccesoriosPantalla } from '@/modules/pizarra/components/accesorios';

export const metadata: Metadata = { title: 'Tipos de accesorio' };

/** Flota > Tipos de accesorio: las columnas de accesorios de la Pizarra (migración 39). */
export default async function Pagina() {
  await requirePermiso('flota.pizarra:ver');
  return <AccesoriosPantalla />;
}
