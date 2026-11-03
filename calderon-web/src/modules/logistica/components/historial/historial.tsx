'use client';

import { useEffect, useState } from 'react';
import { History, ListChecks, LoaderCircle } from 'lucide-react';
import { ErrorBase } from '@/modules/combustible/components/comun/ui';
import { useSesion } from '@/modules/core/session/session-provider';
import type { ErrorAccion } from '@/server/actions/result';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora, hoyEnZona } from '@/shared/lib/fechas';
import { BOTON_PRIMARIO, TARJETA } from '@/shared/ui/clases';
import { NombreEnlazado } from '@/shared/ui/nombre-enlazado';
import type { FechaDia } from '@/shared/types/dominio';
import { ETIQUETA_ESTADO_TRAMO, VERSION_HISTORIAL, type Movimiento } from '../../domain/historial';
import { useAgregarItemViaje, useHistorialChofer, useHistorialOperacion, useLineas, useTramosDelViaje } from '../../queries/hooks';

const sumarDias = (dia: string, n: number) => {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10) as FechaDia;
};

/**
 * Migración 153: al cargar el viaje del chofer, las operaciones que tenía asignadas en ese período
 * (Operaciones › equipo, relevos y cambios de tractor). Se marcan los tramos que hizo y se agregan.
 */
export function AsignadosDelViaje({ viajeId, onListo }: { viajeId: number; onListo: () => void }) {
  const hay = useBaseTiene(VERSION_HISTORIAL);
  const { zonaHoraria } = useSesion();
  const { data, isPending } = useTramosDelViaje(viajeId, hay);
  const { data: lineas } = useLineas();
  const agregar = useAgregarItemViaje();
  const [marcados, setMarcados] = useState<Record<number, number | null>>({});
  const [error, setError] = useState<ErrorAccion | null>(null);

  // Vienen marcados los que todavía no están cargados, con la línea sugerida
  useEffect(() => {
    if (!data) return;
    setMarcados(Object.fromEntries(data.filter((t) => !t.yaCargado).map((t) => [t.tramoId, t.lineaId])));
  }, [data]);

  if (!hay) return null;
  if (isPending) return <p className="text-sm text-tinta-suave">Buscando lo que tenía asignado el chofer…</p>;
  if (!data || data.length === 0)
    return <p className="rounded-md bg-fondo px-3 py-2 text-sm text-tinta-suave">El chofer no tenía operaciones asignadas en el período de este viaje: buscalas abajo.</p>;

  const elegidos = data.filter((t) => t.tramoId in marcados);
  const sinLinea = elegidos.filter((t) => !marcados[t.tramoId]);

  return (
    <div className="space-y-2 rounded-lg border border-marca/40 bg-marca-suave/30 p-3">
      <p className="flex items-center gap-2 text-sm font-medium text-tinta">
        <ListChecks className="size-4 text-marca" /> Lo que tenía asignado el chofer en este viaje
      </p>
      <ul className="divide-y divide-borde rounded-md border border-borde bg-panel">
        {data.map((t) => {
          const marcado = t.tramoId in marcados;
          return (
            <li key={t.tramoId} className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm', t.yaCargado && 'text-tinta-suave')}>
              <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  disabled={t.yaCargado}
                  checked={t.yaCargado || marcado}
                  onChange={() =>
                    setMarcados((m) => {
                      const n = { ...m };
                      if (t.tramoId in n) delete n[t.tramoId];
                      else n[t.tramoId] = t.lineaId;
                      return n;
                    })
                  }
                />
                <span className="min-w-0">
                  <span className="font-mono font-semibold">N° {t.numero ?? '—'}</span>
                  {t.cliente && ` · ${t.cliente}`}
                  <span className="block text-xs text-tinta-suave">
                    {t.origen} → {t.destino}
                    {t.desde && ` · ${formatearFechaHora(t.desde, zonaHoraria)}`}
                    {t.tractor && ` · ${t.tractor}${t.mismoTractor ? '' : ' (otro tractor)'}`}
                    {t.relevo && ' · con relevo de chofer'}
                    {t.yaCargado && ' · ya está en el viaje'}
                  </span>
                </span>
              </label>
              {marcado && !t.yaCargado && (
                <select
                  aria-label={`Tramo de la operación ${t.numero}`}
                  value={marcados[t.tramoId] ?? ''}
                  onChange={(e) => setMarcados((m) => ({ ...m, [t.tramoId]: e.target.value ? Number(e.target.value) : null }))}
                  className={cn('h-8 rounded-md border bg-panel px-2 text-sm', marcados[t.tramoId] ? 'border-borde' : 'border-alerta')}
                >
                  <option value="">Elegí el tramo que hizo…</option>
                  {lineas
                    ?.filter((l) => l.activa || l.id === marcados[t.tramoId])
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.codigo}
                        {l.distanciaKm !== null ? ` · ${l.distanciaKm.toLocaleString('es-AR')} km` : ''}
                      </option>
                    ))}
                </select>
              )}
            </li>
          );
        })}
      </ul>
      {sinLinea.length > 0 && <p className="text-xs text-alerta">Elegí el tramo (línea) de las marcadas en naranja.</p>}
      <ErrorBase error={error} />
      <button
        type="button"
        className={BOTON_PRIMARIO}
        disabled={agregar.isPending || elegidos.length === 0}
        onClick={async () => {
          setError(null);
          // Uno por uno: si alguno falla, se muestra el mensaje de la base y quedan marcados los que faltan
          for (const t of elegidos) {
            const r = await agregar.mutateAsync({ viajeId, servicioId: t.servicioId, lineaId: marcados[t.tramoId] ?? null });
            if (!r.ok) return setError(r.error);
            setMarcados((m) => {
              const n = { ...m };
              delete n[t.tramoId];
              return n;
            });
          }
          onListo();
        }}
      >
        {agregar.isPending && <LoaderCircle className="size-4 animate-spin" />} Agregar {elegidos.length > 0 ? `los ${elegidos.length} marcados` : ''}
      </button>
    </div>
  );
}

function FilaMovimiento({ m, mostrarChofer, mostrarOperacion }: { m: Movimiento; mostrarChofer: boolean; mostrarOperacion: boolean }) {
  const { zonaHoraria } = useSesion();
  return (
    <tr className="align-top">
      <td className="px-2 py-1.5 whitespace-nowrap tabular-nums">
        {m.desde ? formatearFechaHora(m.desde, zonaHoraria) : '—'}
        {m.hasta && <span className="block text-xs text-tinta-suave">a {formatearFechaHora(m.hasta, zonaHoraria)}</span>}
      </td>
      {mostrarOperacion && (
        <td className="px-2 py-1.5">
          {m.servicioId ? (
            <NombreEnlazado tipo="operacion" id={m.servicioId} className="font-mono font-semibold text-marca hover:underline">
              N° {m.numero}
            </NombreEnlazado>
          ) : (
            '—'
          )}
          {m.cliente && <span className="block text-xs text-tinta-suave">{m.cliente}</span>}
        </td>
      )}
      {mostrarChofer && (
        <td className="px-2 py-1.5">
          {m.choferId ? (
            <NombreEnlazado tipo="chofer" id={m.choferId} className="text-marca hover:underline">
              {m.chofer ?? '—'}
            </NombreEnlazado>
          ) : (
            '—'
          )}
          {m.relevo && <span className="block text-xs text-alerta">relevo</span>}
        </td>
      )}
      <td className="px-2 py-1.5">
        {m.origen ?? '—'} → {m.destino ?? '—'}
        {!m.conCarga && <span className="block text-xs text-tinta-suave">vacío</span>}
      </td>
      <td className="px-2 py-1.5 font-mono text-xs">
        {m.tractor ?? '—'}
        {m.semi && <span className="block text-tinta-suave">{m.semi}</span>}
      </td>
      <td className="px-2 py-1.5 text-xs">
        {ETIQUETA_ESTADO_TRAMO[m.estado] ?? m.estado}
        {!mostrarChofer && m.relevo && <span className="block text-alerta">con relevo</span>}
        {m.viaje && <span className="block text-tinta-suave">viaje {m.viaje}</span>}
      </td>
    </tr>
  );
}

/** Migración 153: historial del chofer: qué llevó, con qué tractor y semi, de dónde a dónde y cuándo. */
export function HistorialChofer({ choferId }: { choferId: number }) {
  const hay = useBaseTiene(VERSION_HISTORIAL);
  const { zonaHoraria } = useSesion();
  const hoy = hoyEnZona(zonaHoraria) as FechaDia;
  const [dias, setDias] = useState(90);
  const { data, isPending, error } = useHistorialChofer(choferId, sumarDias(hoy, -dias), hoy, hay);
  if (!hay) return null;
  return (
    <section className={cn(TARJETA, 'space-y-3 p-5')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-tinta">
          <History className="size-4 text-marca" /> Historial de viajes y asignaciones
        </h2>
        <select aria-label="Período" value={dias} onChange={(e) => setDias(Number(e.target.value))} className="h-8 rounded-md border border-borde bg-panel px-2 text-sm">
          <option value={30}>Últimos 30 días</option>
          <option value={90}>Últimos 90 días</option>
          <option value={180}>Últimos 6 meses</option>
          <option value={365}>Último año</option>
        </select>
      </div>
      {isPending ? (
        <p className="text-sm text-tinta-suave">Cargando…</p>
      ) : error ? (
        <p className="text-sm text-error">{error instanceof Error ? error.message : 'No se pudo leer el historial.'}</p>
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-tinta-suave">No tuvo operaciones asignadas en el período.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="border-b border-borde text-left text-xs tracking-wide text-tinta-suave uppercase">
              <tr>
                <th className="px-2 py-2">Cuándo</th>
                <th className="px-2 py-2">Operación</th>
                <th className="px-2 py-2">De → a</th>
                <th className="px-2 py-2">Tractor / semi</th>
                <th className="px-2 py-2">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {data.map((m) => (
                <FilaMovimiento key={`${m.tramoId}-${m.desde}`} m={m} mostrarChofer={false} mostrarOperacion />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Migración 153: quién llevó la operación y quién la trajo, tramo por tramo. */
export function QuienLaLlevo({ servicioId }: { servicioId: number }) {
  const hay = useBaseTiene(VERSION_HISTORIAL);
  const { data } = useHistorialOperacion(servicioId, hay);
  if (!hay || !data || data.length === 0) return null;
  return (
    <div className="text-sm">
      <p className="text-xs font-medium text-tinta-suave uppercase">Quién la llevó</p>
      <div className="mt-1 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <tbody className="divide-y divide-borde">
            {data.map((m) => (
              <FilaMovimiento key={`${m.tramoId}-${m.desde}`} m={m} mostrarChofer mostrarOperacion={false} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
