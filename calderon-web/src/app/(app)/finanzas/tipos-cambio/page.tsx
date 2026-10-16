import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { TiposCambioPantalla } from '@/modules/catalogos/components/tipos-cambio';

export const metadata: Metadata = { title: 'Tipos de cambio' };

/** Tipos de cambio (migración 28). */
export default async function Pagina() {
  await requirePermiso('finanzas.tipos_cambio:ver');
  return <TiposCambioPantalla />;
}
