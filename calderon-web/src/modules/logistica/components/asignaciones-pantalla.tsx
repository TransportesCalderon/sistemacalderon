'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, LoaderCircle, Search, Truck } from 'lucide-react';
import { Cargando, Encabezado, ErrorBase, ErrorLectura, Vacio } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { normalizar } from '@/modules/pizarra/domain/pizarra.filtros';
import type { ErrorAccion } from '@/server/actions/result';
import { cn } from '@/shared/lib/cn';
import { formatearFechaDia, hoyEnZona } from '@/shared/lib/fechas';
import { CONTROL_FILTRO, TARJETA } from '@/shared/ui/clases';
import type { Tractor } from '../domain/viaje-chofer.types';
import { useAsignarTractor, useOpcionesViaje, useTractores } from '../queries/hooks';
import { Lista } from './viajes-pantalla';

/**
 * Flota › Choferes de los tractores (migración 109): todos los tractores con su chofer fijo en una sola lista. Se
 * cambia eligiendo otro chofer: se guarda solo. Las reglas (un chofer, un tractor; fechas) las controla la base.
 */
export function AsignacionesPantalla() {
  const { zonaHoraria } = useSesion();
  const puede = useCan('flota.asignaciones:editar');
  const { data, isPending, isError, refetch } = useTractores();
  const { data: op } = useOpcionesViaje();
  const [desde, setDesde] = useState<string>(hoyEnZona(zonaHoraria));
  const [texto, setTexto] = useState('');
  const t = normalizar(texto);
  const filas = (data ?? []).filter((x) => !t || [x.patente, x.codigoInterno, x.chofer ?? ''].some((c) => normalizar(c).includes(t)));
  const sinChofer = (data ?? []).filter((x) => !x.choferId).length;

  return (
    <div className="space-y-4">
      <Encabezado titulo="Choferes de los tractores" subtitulo="Flota" />
      <p className="max-w-3xl text-sm text-tinta-suave">
        Elegí el chofer fijo de cada tractor y se guarda solo. Un chofer tiene un solo tractor: si lo asignás a otro, el anterior queda sin chofer. El chofer
        fijo es el que propone el sistema al iniciar un viaje y el que muestra el mapa cuando no hay tarjeta del tacógrafo.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="relative block w-full max-w-xs">
          <span className="sr-only">Buscar</span>
          <Search className="absolute top-2.5 left-2.5 size-4 text-tinta-suave" />
          <input
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Patente o chofer…"
            className={cn(CONTROL_FILTRO, 'w-full pl-8')}
          />
        </label>
        {puede && (
          <label className="space-y-1 text-sm">
            <span className="block text-xs text-tinta-suave">Los cambios rigen desde</span>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={CONTROL_FILTRO} />
          </label>
        )}
        {sinChofer > 0 && <span className="pb-1.5 text-sm font-medium text-[#b54708]">{sinChofer} sin chofer</span>}
      </div>

      <div className={cn(TARJETA, 'overflow-x-auto')}>
        {isPending ? (
          <Cargando texto="Cargando tractores…" />
        ) : isError ? (
          <ErrorLectura texto="No se pudieron cargar los tractores." onReintentar={() => refetch()} />
        ) : filas.length === 0 ? (
          <Vacio icono={<Truck className="size-5" />} texto="No hay tractores." />
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-borde bg-fondo text-left text-xs tracking-wide text-tinta-suave uppercase">
              <tr>
                <th className="px-3 py-2">Tractor</th>
                <th className="px-3 py-2">Chofer fijo</th>
                <th className="px-3 py-2">Desde</th>
                <th className="px-3 py-2">Ahora</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {filas.map((x) => (
                <Fila key={x.camionId} t={x} puede={puede} desde={desde} choferes={op?.choferes} />
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-tinta-suave">
        También se puede cambiar desde{' '}
        <Link href="/operacion/tractores" className="text-marca hover:underline">
          Viajes › Tractores y viajes
        </Link>
        .
      </p>
    </div>
  );
}

function Fila({
  t,
  puede,
  desde,
  choferes,
}: {
  t: Tractor;
  puede: boolean;
  desde: string;
  choferes: Parameters<typeof Lista>[0]['opciones'];
}) {
  const asignar = useAsignarTractor();
  const [error, setError] = useState<ErrorAccion | null>(null);
  const [listo, setListo] = useState(false);
  const cambiar = async (chofer: string) => {
    setError(null);
    setListo(false);
    const r = await asignar.mutateAsync({ camionId: t.camionId, choferId: chofer, desde });
    if (r.ok) setListo(true);
    else setError(r.error);
  };
  return (
    <>
      <tr className={cn(!t.choferId && 'bg-alerta-suave/40')}>
        <td className="px-3 py-2">
          <span className="font-mono font-semibold text-tinta">{t.patente}</span>
          <span className="block text-xs text-tinta-suave">{t.codigoInterno}</span>
        </td>
        <td className="px-3 py-2">
          {puede ? (
            <span className="flex items-center gap-2">
              <Lista
                valor={t.choferId ? String(t.choferId) : ''}
                opciones={choferes}
                onCambiar={(v) => void cambiar(v)}
                vacio="Sin chofer"
                disabled={asignar.isPending}
                aria-label={`Chofer de ${t.patente}`}
                className="h-9 w-full max-w-xs rounded-md border border-borde bg-panel px-2"
              />
              {asignar.isPending && <LoaderCircle className="size-4 animate-spin text-tinta-suave" />}
              {listo && !asignar.isPending && <Check className="size-4 text-exito" />}
            </span>
          ) : (
            <span className={t.chofer ? 'text-tinta' : 'text-[#b54708]'}>{t.chofer ?? 'Sin chofer'}</span>
          )}
        </td>
        <td className="px-3 py-2 tabular-nums text-tinta-suave">{t.asignadoDesde ? formatearFechaDia(t.asignadoDesde) : '—'}</td>
        <td className="px-3 py-2 text-xs text-tinta-suave">
          {t.situacion === 'en_viaje' ? `En viaje ${t.viajeNumero ?? ''}${t.viajeChofer ? ` · ${t.viajeChofer}` : ''}` : t.situacion === 'taller' ? 'En taller' : ''}
        </td>
      </tr>
      {error && (
        <tr>
          <td colSpan={4} className="px-3 pb-2">
            <ErrorBase error={error} />
          </td>
        </tr>
      )}
    </>
  );
}
