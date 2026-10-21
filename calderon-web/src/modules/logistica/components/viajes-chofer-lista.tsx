'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Route } from 'lucide-react';
import { TD, TH } from '@/modules/catalogos/components/comun';
import { Cargando, Chip, Encabezado, ErrorLectura, Vacio } from '@/modules/combustible/components/comun/ui';
import { useSesion } from '@/modules/core/session/session-provider';
import { normalizar } from '@/modules/pizarra/domain/pizarra.filtros';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora, hoyEnZona } from '@/shared/lib/fechas';
import { TARJETA } from '@/shared/ui/clases';
import { Pestanas } from '@/shared/ui/pestanas';
import { PESTANAS_TRACTORES } from '@/shared/ui/pestanas-secciones';
import type { FechaDia } from '@/shared/types/dominio';
import { ETIQUETA_SITUACION_VIAJE_CHOFER, SITUACIONES_VIAJE_CHOFER, type SituacionViajeChofer } from '../domain/viaje-chofer.types';
import { useViajesChofer } from '../queries/hooks';
import { SituacionViajeChoferChip, formatoNumero } from './viaje-chofer-comun';

const ESTADO_COMBUSTIBLE: Record<string, string> = { borrador: 'Calculado', aprobado: 'Aprobado' };

/** Logística > Tractores y viajes > Viajes de chofer: los abiertos siempre; los cerrados entre las fechas. */
export function ViajesChoferLista() {
  const router = useRouter();
  const { zonaHoraria } = useSesion();
  const hoy = hoyEnZona(zonaHoraria);
  const hace60 = new Date(Date.parse(`${hoy}T12:00:00Z`) - 60 * 86_400_000).toISOString().slice(0, 10) as FechaDia;
  const [desde, setDesde] = useState<string>(hace60);
  const [hasta, setHasta] = useState<string>(hoy);
  const [filtro, setFiltro] = useState<SituacionViajeChofer | null>(null);
  const [texto, setTexto] = useState('');
  const { data, isPending, isError, refetch } = useViajesChofer((desde || null) as FechaDia | null, (hasta || null) as FechaDia | null);
  const t = normalizar(texto);
  const filas = (data ?? []).filter(
    (v) => (!filtro || v.situacion === filtro) && (!t || [v.numero, v.patente, v.chofer, v.operaciones ?? ''].some((c) => normalizar(c).includes(t))),
  );

  return (
    <div className="space-y-5">
      <Encabezado titulo="Tractores y viajes" subtitulo="Viajes" />
      <Pestanas items={PESTANAS_TRACTORES} />
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="Buscar viaje, tractor, chofer u operación"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          className="h-9 w-full max-w-xs rounded-md border border-borde bg-panel px-3 text-sm outline-none focus:border-marca"
        />
        {SITUACIONES_VIAJE_CHOFER.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={filtro === s}
            onClick={() => setFiltro(filtro === s ? null : s)}
            className={cn(
              'h-9 rounded-full border px-3 text-sm',
              filtro === s ? 'border-marca bg-marca-suave font-medium text-marca' : 'border-borde bg-panel text-tinta hover:bg-hover',
            )}
          >
            {ETIQUETA_SITUACION_VIAJE_CHOFER[s]} ({(data ?? []).filter((v) => v.situacion === s).length})
          </button>
        ))}
        <span className="ml-auto flex items-center gap-2 text-sm text-tinta-suave">
          Cerrados entre
          <input type="date" aria-label="Desde" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-9 rounded-md border border-borde bg-panel px-2" />y
          <input type="date" aria-label="Hasta" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-9 rounded-md border border-borde bg-panel px-2" />
        </span>
      </div>

      <div className={cn(TARJETA, 'overflow-x-auto')}>
        {isPending ? (
          <Cargando texto="Cargando viajes…" />
        ) : isError ? (
          <ErrorLectura texto="No se pudieron cargar los viajes." onReintentar={() => refetch()} />
        ) : filas.length === 0 ? (
          <Vacio icono={<Route className="size-5" />} texto={data.length === 0 ? 'Todavía no hay viajes de chofer: se inician desde la pestaña Tractores.' : 'Ningún viaje coincide.'} />
        ) : (
          <table className="w-full min-w-[960px] text-sm">
            <thead className="border-b border-borde bg-fondo">
              <tr>
                <th className={TH}>Viaje</th>
                <th className={TH}>Tractor</th>
                <th className={TH}>Chofer</th>
                <th className={TH}>Salida</th>
                <th className={TH}>Llegada</th>
                <th className={TH}>Operaciones</th>
                <th className={cn(TH, 'text-right')}>Km</th>
                <th className={cn(TH, 'text-right')}>Canon</th>
                <th className={TH}>Situación</th>
                <th className={TH}>Combustible</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {filas.map((v) => (
                <tr
                  key={v.id}
                  tabIndex={0}
                  className="cursor-pointer hover:bg-hover focus:bg-hover focus:outline-none"
                  onClick={() => router.push(`/operacion/viajes-chofer/${v.id}`)}
                  onKeyDown={(e) => e.key === 'Enter' && router.push(`/operacion/viajes-chofer/${v.id}`)}
                >
                  <td className={cn(TD, 'font-mono font-semibold text-marca')}>{v.numero}</td>
                  <td className={cn(TD, 'font-mono')}>{v.patente}</td>
                  <td className={TD}>{v.chofer}</td>
                  <td className={cn(TD, 'whitespace-nowrap')}>{formatearFechaHora(v.salida, zonaHoraria)}</td>
                  <td className={cn(TD, 'whitespace-nowrap')}>{v.llegada ? formatearFechaHora(v.llegada, zonaHoraria) : <span className="text-tinta-suave">En viaje</span>}</td>
                  <td className={TD}>
                    {v.operaciones ?? <span className="text-tinta-suave">—</span>}
                    {v.relevo && (
                      <span className="ml-1.5">
                        <Chip tono="alerta" title="Alguna operación la hizo también otro chofer">
                          Relevo
                        </Chip>
                      </span>
                    )}
                  </td>
                  <td className={cn(TD, 'text-right tabular-nums')}>{formatoNumero(v.km)}</td>
                  <td className={cn(TD, 'text-right whitespace-nowrap tabular-nums')}>{v.canon ?? '—'}</td>
                  <td className={TD}>
                    <SituacionViajeChoferChip s={v.situacion} />
                  </td>
                  <td className={cn(TD, 'text-tinta-suave')}>{v.cierreEstado ? (ESTADO_COMBUSTIBLE[v.cierreEstado] ?? v.cierreEstado) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
