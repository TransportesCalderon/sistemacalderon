import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { ParametrosPantalla } from '@/modules/catalogos/components/parametros';

export const metadata: Metadata = { title: 'Parámetros' };

/** Parámetros (migración 28). */
export default async function Pagina() {
  await requirePermiso('configuracion.catalogos:ver');
  return <ParametrosPantalla />;
}
