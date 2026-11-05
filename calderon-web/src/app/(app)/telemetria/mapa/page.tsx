import type { Metadata } from 'next';
import { requirePermiso } from '@/modules/core/auth/guards';
import { SeguimientoViajes } from '@/modules/telemetria/components/seguimiento-viajes';

export const metadata: Metadata = { title: 'Seguimiento de viajes' };

/**
 * Migración 194 · Módulo Telemetría: «Seguimiento de viajes» se ve en /telemetria/seguimiento
 * (rutas.ts la reescribe a esta página). La dirección vieja /telemetria/mapa sigue llevando al
 * mapa de flota (/pizarra/mapa), así que esta página ya no mostraba el mapa.
 */
export default async function Pagina() {
  await requirePermiso('telemetria.mapa:ver');
  return <SeguimientoViajes />;
}
