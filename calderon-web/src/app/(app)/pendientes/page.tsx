import { redirect } from 'next/navigation';
import { requirePermiso } from '@/modules/core/auth/guards';

/** Mis pendientes está dentro de «Hoy» (migración 116): esta dirección solo lleva ahí. */
export default async function Pagina() {
  await requirePermiso('inicio.pendientes:ver');
  redirect('/hoy');
}
