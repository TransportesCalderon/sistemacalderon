'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Gauge } from 'lucide-react';
import { useSesion } from '@/modules/core/session/session-provider';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { browserDb } from '@/shared/supabase/browser';
import { VERSION_TABLERO_CARGA } from '../domain/tablero.types';
import { tableroRepository } from '../repositories/tablero.repository';

/** Migración 224 · Al chofer: su camión llenó de corte (inicio de viaje) y todavía no mandó las fotos del tablero. */
export function AvisoTableroInicio() {
  const hay = useBaseTiene(VERSION_TABLERO_CARGA);
  const { zonaHoraria } = useSesion();
  const { data } = useQuery({
    queryKey: ['tablero', 'pendientes-chofer'],
    queryFn: () => tableroRepository(browserDb()).pendientesChofer(),
    enabled: hay,
    refetchInterval: 5 * 60_000,
  });
  const p = data?.[0];
  if (!p) return null;
  return (
    <Link href="/mi-viaje?ver=tablero" className="flex items-start gap-3 rounded-xl border-2 border-alerta bg-alerta-suave p-4">
      <Gauge className="mt-0.5 size-6 shrink-0 text-alerta" />
      <span className="text-sm text-tinta">
        <strong className="block text-alerta">Faltan las fotos del tablero</strong>
        El {p.patente} llenó de corte el {formatearFechaHora(p.fechaHora, zonaHoraria)} ({formatearNumero(p.litros, 0)} L). Sacá las fotos antes de tocar
        «Restablecer».
      </span>
    </Link>
  );
}
