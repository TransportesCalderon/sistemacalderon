import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requirePermiso } from '@/modules/core/auth/guards';
import { VERSION_HOY } from '@/modules/hoy/hoy';
import { baseTiene } from '@/shared/lib/version-base';
import { PendientesPantalla } from '@/modules/pendientes/components/pendientes-pantalla';

export const metadata: Metadata = { title: 'Mis pendientes' };

/** Mis pendientes (migración 34). */
export default async function Pagina() {
  const ctx = await requirePermiso('inicio.pendientes:ver');
  // Sprint 3: con la migración 116, Mis pendientes está dentro de «Hoy»
  if (baseTiene(ctx.versionBase, VERSION_HOY)) redirect('/hoy');
  return <PendientesPantalla />;
}
