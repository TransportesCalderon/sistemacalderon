import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { PendientesPantalla } from '@/modules/pendientes/components/pendientes-pantalla';

export const metadata: Metadata = { title: 'Mis pendientes' };

/** Mis pendientes (migración 34). */
export default async function Pagina() {
  await requirePermiso('inicio.pendientes:ver');
  return <PendientesPantalla />;
}
