import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { BancosPantalla } from '@/modules/finanzas/components/bancos-pantalla';
import { MovimientosPantalla } from '@/modules/finanzas/components/movimientos-pantalla';
import { Pestanas } from '@/shared/ui/pestanas';
import { PESTANAS_CONCILIACION } from '@/shared/ui/pestanas-secciones';

export const metadata: Metadata = { title: 'Bancos' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * Bancos (antes Conciliación): bancos, cajas y su cartola (migración 73; Sprint 7: antes /finanzas/bancos).
 * 20/11/2026 (plan de simplificación, cambio 4): la pestaña Movimientos (?vista=movimientos, antes Cobros y pagos ›
 * Entradas y salidas) es una vista de la misma página; ?cuenta= elige la cuenta.
 */
export default async function Pagina({ searchParams }: Props) {
  await requirePermiso('finanzas.bancos:ver');
  const sp = await searchParams;
  return (
    <>
      <Pestanas items={PESTANAS_CONCILIACION} />
      {sp.vista === 'movimientos' ? <MovimientosPantalla cuentaInicial={Number(sp.cuenta) || null} /> : <BancosPantalla />}
    </>
  );
}
