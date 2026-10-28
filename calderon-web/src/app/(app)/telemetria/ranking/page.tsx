import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { RankingMensualPantalla } from '@/modules/telemetria/components/ranking-mensual';

export const metadata: Metadata = { title: 'Ranking de choferes' };

/** Viajes › Ranking de choferes: los mejores choferes de cada mes por Puntaje Calderón (migración 103). */
export default async function Pagina() {
  await requirePermiso('telemetria.sesiones:ver');
  return <RankingMensualPantalla />;
}
