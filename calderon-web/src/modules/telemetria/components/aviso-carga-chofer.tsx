'use client';

import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Fuel, Gauge, X } from 'lucide-react';
import { formatearNumero } from '@/shared/lib/numeros';
import { browserDb } from '@/shared/supabase/browser';
import { avisoCargaVisto } from '../actions/tablero.actions';
import { tableroRepository } from '../repositories/tablero.repository';
import { invalidar } from '@/shared/query/invalidar';

/**
 * Migración 89: cuando el camión llega a una estación, cuántos litros cargar para llenar
 * (lo que consumió desde el último corte). Se revisa cada minuto mientras la pantalla está abierta.
 */
export function AvisoCargaChofer() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['tablero', 'mis-avisos'],
    queryFn: () => tableroRepository(browserDb()).misAvisos(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const a = data?.[0];
  if (!a) return null;
  return (
    <div className="space-y-2 rounded-xl border-2 border-marca bg-marca-suave p-4">
      <div className="flex items-start gap-3">
        <Fuel className="mt-0.5 size-6 shrink-0 text-marca" />
        <div className="flex-1">
          <p className="text-sm text-tinta">Llegaste a {a.estacion}</p>
          <p className="text-2xl font-bold text-marca">Cargá ≈ {formatearNumero(a.litros, 0)} L</p>
          <p className="text-xs text-tinta-suave">
            Para llenar el {a.patente}{a.texto ? ` (${a.texto})` : ''}.
          </p>
        </div>
        <button
          type="button"
          aria-label="Ocultar"
          className="rounded-md p-1 text-tinta-suave hover:bg-hover"
          onClick={async () => {
            await avisoCargaVisto({ id: a.id });
            void invalidar(qc, 'aviso_carga');
          }}
        >
          <X className="size-5" />
        </button>
      </div>
      <Link href="/mi-viaje?ver=tablero" className="flex items-center justify-center gap-2 rounded-md bg-panel px-3 py-2 text-sm font-medium text-marca">
        <Gauge className="size-4" /> Si es llenado de corte: sacá las fotos del tablero
      </Link>
    </div>
  );
}
