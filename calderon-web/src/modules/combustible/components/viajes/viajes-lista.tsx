'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilePlus2, LoaderCircle, Route, X } from 'lucide-react';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import type { ErrorAccion } from '@/server/actions/result';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { CONTROL_FILTRO, TARJETA } from '@/shared/ui/clases';
import {
  ETIQUETA_SITUACION_VIAJE,
  SITUACIONES_VIAJE,
  TAMANO_PAGINA_VIAJES,
  parsearListaViajes,
  serializarListaViajes,
  type SituacionViaje,
  type Viaje,
  type ViajeListaParams,
} from '../../domain/viaje.types';
import { useCamionesCombustible, useCrearBorrador, useViajes } from '../../queries/hooks';
import { useFiltrosUrl } from '../comun/filtros';
import { Cargando, Chip, Encabezado, ErrorBase, ErrorLectura, Paginador, Vacio, type Tono } from '../comun/ui';

const TONO_SITUACION: Record<SituacionViaje, Tono> = {
  en_curso: 'neutro',
  sin_cierre: 'alerta',
  borrador: 'marca',
  aprobado: 'exito',
  cierre_desactualizado: 'error',
};

export function SituacionViajeChip({ situacion }: { situacion: SituacionViaje }) {
  return <Chip tono={TONO_SITUACION[situacion]}>{ETIQUETA_SITUACION_VIAJE[situacion]}</Chip>;
}

/**
 * Combustible > Viajes. Fuente única: fue.v_viaje (tramos entre fronteras consecutivas).
 * Un viaje sin cierre se cierra creando el borrador; el resto abre su cierre.
 */
export function ViajesLista() {
  const searchParams = useSearchParams();
  const { zonaHoraria } = useSesion();
  const params = useMemo(() => parsearListaViajes(new URLSearchParams(searchParams.toString())), [searchParams]);
  const { actualizar, limpiar, navegando } = useFiltrosUrl<ViajeListaParams>(params, serializarListaViajes);
  const { data, isPending, isError, isFetching, refetch } = useViajes(params);
  const { data: camiones } = useCamionesCombustible();
  const hayFiltros = Boolean(params.camionId || params.situacion);

  return (
    <div className="space-y-5">
      <Encabezado titulo="Viajes" />
      <p className="text-sm text-tinta-suave">
        Un viaje va de una frontera a la siguiente del mismo camión. Si un cierre se anula, el viaje vuelve a figurar sin cierre.
      </p>

      <section className={cn(TARJETA, 'flex flex-wrap items-center gap-2 p-3')} aria-label="Filtros">
        <select
          aria-label="Camión"
          className={CONTROL_FILTRO}
          value={params.camionId ?? ''}
          onChange={(e) => actualizar({ camionId: e.target.value ? Number(e.target.value) : undefined })}
        >
          <option value="">Todos los camiones</option>
          {camiones?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.codigoInterno} · {c.patente}
            </option>
          ))}
        </select>
        <select
          aria-label="Situación"
          className={CONTROL_FILTRO}
          value={params.situacion ?? ''}
          onChange={(e) => actualizar({ situacion: (e.target.value || undefined) as SituacionViaje | undefined })}
        >
          <option value="">Todas las situaciones</option>
          {SITUACIONES_VIAJE.map((s) => (
            <option key={s} value={s}>
              {ETIQUETA_SITUACION_VIAJE[s]}
            </option>
          ))}
        </select>
        {hayFiltros && (
          <button type="button" onClick={limpiar} className="flex h-9 items-center gap-1 rounded-md px-2 text-sm text-marca hover:bg-marca-suave">
            <X className="size-4" /> Limpiar
          </button>
        )}
        {(navegando || (isFetching && !isPending)) && <LoaderCircle className="ml-auto size-4 animate-spin text-tinta-suave" aria-label="Actualizando" />}
      </section>

      <section className={cn(TARJETA, 'overflow-hidden')}>
        {isError ? (
          <ErrorLectura texto="No se pudo cargar la lista de viajes." onReintentar={() => refetch()} />
        ) : isPending ? (
          <Cargando texto="Cargando viajes…" />
        ) : data.filas.length === 0 ? (
          <Vacio icono={<Route className="size-6" />} texto={hayFiltros ? 'Ningún viaje coincide con los filtros.' : 'Todavía no hay viajes: se arman con las cargas marcadas como frontera.'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b border-borde bg-fondo text-left text-xs font-medium tracking-wide text-tinta-suave uppercase">
                <tr>
                  <th className="px-3 py-2.5">Camión</th>
                  <th className="px-3 py-2.5">Frontera inicial</th>
                  <th className="px-3 py-2.5">Frontera final</th>
                  <th className="px-3 py-2.5">Situación</th>
                  <th className="px-3 py-2.5">Cierre</th>
                </tr>
              </thead>
              <tbody className={cn('divide-y divide-borde', isFetching && 'opacity-70')}>
                {data.filas.map((v) => (
                  <tr key={`${v.camionId}-${v.cargaSalidaId}`} className="hover:bg-hover">
                    <td className="px-3 py-2.5 font-mono">{v.patente}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <Link href={`/combustible/cargas/${v.cargaSalidaId}`} className="text-marca hover:underline">
                        {formatearFechaHora(v.salidaTs, zonaHoraria)}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {v.cargaLlegadaId ? (
                        <Link href={`/combustible/cargas/${v.cargaLlegadaId}`} className="text-marca hover:underline">
                          {formatearFechaHora(v.llegadaTs, zonaHoraria)}
                        </Link>
                      ) : (
                        <span className="text-tinta-suave">Todavía no llegó</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <SituacionViajeChip situacion={v.situacion} />
                    </td>
                    <td className="px-3 py-2.5">
                      <AccionViaje viaje={v} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.filas.length > 0 && (
          <Paginador pagina={params.pagina} total={data.total ?? 0} tamano={TAMANO_PAGINA_VIAJES} onCambiar={(p) => actualizar({ pagina: p }, true)} />
        )}
      </section>
    </div>
  );
}

function AccionViaje({ viaje }: { viaje: Viaje }) {
  const router = useRouter();
  const puedeEditar = useCan('combustible.cierre_viaje:editar');
  const crear = useCrearBorrador();
  const [error, setError] = useState<ErrorAccion | null>(null);

  if (viaje.cierreId) {
    return (
      <Link href={`/combustible/cierres/${viaje.cierreId}`} className="text-marca hover:underline">
        {viaje.cierreNumero ?? `#${viaje.cierreId}`}
      </Link>
    );
  }
  if (viaje.situacion !== 'sin_cierre' || !puedeEditar) return <span className="text-tinta-suave">—</span>;
  return (
    <div className="space-y-1">
      <button
        type="button"
        className="inline-flex items-center gap-1 text-marca hover:underline disabled:opacity-60"
        disabled={crear.isPending}
        onClick={async () => {
          setError(null);
          const r = await crear.mutateAsync({ camionId: viaje.camionId, cargaSalidaId: viaje.cargaSalidaId });
          if (r.ok) router.push(`/combustible/cierres/${r.data}`);
          else setError(r.error);
        }}
      >
        {crear.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <FilePlus2 className="size-4" />} Crear borrador
      </button>
      <ErrorBase error={error} />
    </div>
  );
}
