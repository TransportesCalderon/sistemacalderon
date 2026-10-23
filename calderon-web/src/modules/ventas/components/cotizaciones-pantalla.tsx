'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FileText, Plus, Search } from 'lucide-react';
import { TD, TH } from '@/modules/catalogos/components/comun';
import { Cargando, Encabezado, ErrorLectura, Vacio } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import { cn } from '@/shared/lib/cn';
import { formatearFechaDia } from '@/shared/lib/fechas';
import { BOTON_PRIMARIO, TARJETA } from '@/shared/ui/clases';
import { ETIQUETA_ESTADO_COT, usd, type EstadoCotizacion } from '../domain/ventas.types';
import { useCotizaciones } from '../queries/hooks';
import { ChipCotizacion } from './comun';

const FILTROS: (EstadoCotizacion | null)[] = [null, 'borrador', 'enviada', 'vencida', 'aceptada', 'rechazada'];

/** Ventas › Cotizaciones: la lista con su estado, total y margen. */
export function CotizacionesPantalla() {
  const puede = useCan('ventas.cotizaciones:editar');
  const [estado, setEstado] = useState<EstadoCotizacion | null>(null);
  const [texto, setTexto] = useState('');
  const { data, isLoading, isError, refetch } = useCotizaciones(estado, texto.trim() || null);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Encabezado titulo="Cotizaciones" subtitulo="Ventas" />
        {puede && (
          <Link href="/ventas/cotizaciones/nueva" className={BOTON_PRIMARIO}>
            <Plus className="size-4" /> Nueva cotización
          </Link>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {FILTROS.map((f) => (
          <button
            key={f ?? 'todas'}
            type="button"
            onClick={() => setEstado(f)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm',
              estado === f ? 'border-marca bg-marca-suave font-medium text-marca' : 'border-borde text-tinta-suave hover:bg-hover',
            )}
          >
            {f ? ETIQUETA_ESTADO_COT[f] : 'Todas'}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 rounded-md border border-borde bg-panel px-2">
          <Search className="size-4 text-tinta-suave" />
          <input className="h-9 w-56 bg-transparent text-sm outline-none" placeholder="Empresa o número" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </label>
      </div>
      {isLoading ? (
        <Cargando texto="Leyendo las cotizaciones…" />
      ) : isError || !data ? (
        <ErrorLectura texto="No se pudieron leer las cotizaciones." onReintentar={() => void refetch()} />
      ) : data.length === 0 ? (
        <Vacio icono={<FileText className="size-6" />} texto="No hay cotizaciones con ese filtro." />
      ) : (
        <div className={cn(TARJETA, 'overflow-x-auto')}>
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-borde">
                <th className={TH}>Número</th>
                <th className={TH}>Empresa</th>
                <th className={TH}>Rutas</th>
                <th className={TH}>Fecha · vence</th>
                <th className={TH}>Estado</th>
                <th className={cn(TH, 'text-right')}>Total</th>
                <th className={cn(TH, 'text-right')}>Margen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {data.map((c) => (
                <tr key={c.id} className="hover:bg-hover">
                  <td className={TD}>
                    <Link href={`/ventas/cotizaciones/${c.id}`} className="font-medium text-marca hover:underline">
                      {c.numero}
                    </Link>
                  </td>
                  <td className={TD}>
                    <Link href={`/ventas/empresas/${c.empresaId}`} className="hover:underline">
                      {c.empresa}
                    </Link>
                  </td>
                  <td className={cn(TD, 'max-w-64 text-xs text-tinta-suave')}>{c.rutas}</td>
                  <td className={cn(TD, 'text-xs tabular-nums')}>
                    {formatearFechaDia(c.fecha)}
                    <span className="block text-tinta-suave">{formatearFechaDia(c.vence)}</span>
                  </td>
                  <td className={TD}>
                    <ChipCotizacion estado={c.estado} />
                  </td>
                  <td className={cn(TD, 'text-right font-medium tabular-nums')}>{usd(c.totalUsd)}</td>
                  <td className={cn(TD, 'text-right tabular-nums', c.margenPct !== null && c.margenPct < 0 && 'text-error')}>
                    {c.margenPct === null ? '—' : `${c.margenPct.toLocaleString('es-AR')} %`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
