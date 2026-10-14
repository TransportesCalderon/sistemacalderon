import { redirect } from 'next/navigation';
import { getSessionContext } from '@/modules/core/auth/session';
import { rutaInicial } from '@/modules/core/navigation/filtrar';

/** Raíz: envía a cada usuario a la primera pantalla que su rol puede ver. */
export default async function RaizPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');
  if (!ctx.identidad) redirect('/sin-acceso?motivo=vinculo');
  redirect(rutaInicial(ctx.permisos));
}
