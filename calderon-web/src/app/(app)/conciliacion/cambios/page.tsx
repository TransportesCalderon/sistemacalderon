import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { Pestanas } from '@/shared/ui/pestanas';
import { PESTANAS_CONCILIACION } from '@/shared/ui/pestanas-secciones';
import { CambiosPantalla } from '@/modules/finanzas/components/cambios-pantalla';

export const metadata: Metadata = { title: 'Cambios de moneda' };

/** Migración 123 · Conciliación › Cambios de moneda (armados solos desde las cartolas). */
export default async function Pagina() {
  await requirePermiso('finanzas.bancos:ver');
  return (
    <>
      <Pestanas items={PESTANAS_CONCILIACION} />
      <CambiosPantalla />
    </>
  );
}
