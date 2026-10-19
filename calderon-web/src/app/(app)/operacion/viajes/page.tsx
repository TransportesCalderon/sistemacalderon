import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { ViajesPantalla } from '@/modules/logistica/components/viajes-pantalla';

export const metadata: Metadata = { title: 'Viajes' };

/** Operación > Viajes (Logística, migración 40). ?semi=<id> abre «Asignar viaje» con ese semi; ?tramo=<id> resalta el viaje. */
export default async function Pagina({ searchParams }: { searchParams: Promise<{ semi?: string; tramo?: string }> }) {
  await requirePermiso('operacion.tramos:ver');
  const p = await searchParams;
  const semi = p.semi && /^\d+$/.test(p.semi) ? p.semi : undefined;
  const tramo = p.tramo && /^\d+$/.test(p.tramo) ? Number(p.tramo) : undefined;
  return <ViajesPantalla semiInicial={semi} tramoInicial={tramo} />;
}
