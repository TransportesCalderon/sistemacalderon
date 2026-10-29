import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { MiViaje } from '@/modules/chofer/components/mi-viaje';
import { MisGastos } from '@/modules/chofer/components/mis-gastos';
import { MisLiquidaciones } from '@/modules/liquidacion/components/mis-liquidaciones';
import { TableroChofer } from '@/modules/telemetria/components/tablero-chofer';

export const metadata: Metadata = { title: 'Mi viaje' };

type Props = { searchParams: Promise<{ ver?: string; nuevo?: string }> };

/**
 * Sprint 7 · Mi viaje: la pantalla del chofer. Junta Mi carga, Mis gastos, Mis liquidaciones y el
 * Tablero del camión; cada sección (?ver=…) pide el mismo permiso que su pantalla de antes.
 */
export default async function Pagina({ searchParams }: Props) {
  const { ver, nuevo } = await searchParams;
  if (ver === 'gastos') {
    await requirePermiso('chofer.mis_gastos:ver');
    return <MisGastos abrirNuevo={nuevo === '1'} />;
  }
  if (ver === 'liquidaciones') {
    await requirePermiso('chofer.mis_liquidaciones:ver');
    return <MisLiquidaciones />;
  }
  await requirePermiso('chofer.mi_carga:ver');
  if (ver === 'tablero') return <TableroChofer />;
  return <MiViaje />;
}
