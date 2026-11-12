import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { FondosPantalla } from '@/modules/chofer/components/fondos-pantalla';
import { PedidosFondo } from '@/modules/chofer/components/pedidos-fondo';
import { Pestanas } from '@/shared/ui/pestanas';
import { PESTANAS_LIQUIDACIONES } from '@/shared/ui/pestanas-secciones';

export const metadata: Metadata = { title: 'Fondos de choferes' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Liquidaciones › Fondos de choferes: entregas, vueltos, gastos por revisar y cierre del período (migración 61; Sprint 7: antes /rrhh/fondos). */
export default async function Pagina({ searchParams }: Props) {
  await requirePermiso('rrhh.fondos:ver');
  const sp = await searchParams;
  return (
    <>
      <Pestanas items={PESTANAS_LIQUIDACIONES} />
      {/* Migración 256: pedidos de FF Chofer, como pestaña de Fondos */}
      {sp.vista === 'pedidos' ? <PedidosFondo /> : <FondosPantalla />}
    </>
  );
}
