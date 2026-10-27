import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { TableroChofer } from '@/modules/telemetria/components/tablero-chofer';

export const metadata: Metadata = { title: 'Tablero del camión' };

/** Chofer › Tablero del camión: fotos de la pantalla en el llenado de corte, leídas por IA (migración 88). */
export default async function Pagina() {
  await requirePermiso('chofer.mi_carga:ver');
  return <TableroChofer />;
}
