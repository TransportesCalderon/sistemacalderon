import { redirect } from 'next/navigation';
import { requirePermiso } from '@/modules/core/auth/guards';

/** Inicio es «Hoy» (migración 116): esta dirección solo lleva ahí. */
export default async function InicioPage() {
  await requirePermiso('inicio.dashboard:ver');
  redirect('/hoy');
}
