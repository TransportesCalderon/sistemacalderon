'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Flag, Fuel, LoaderCircle, Plus, X } from 'lucide-react';
import { Can } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { BOTON_PRIMARIO, CONTROL_FILTRO, TARJETA } from '@/shared/ui/clases';
import { parsearListaCargas, serializarListaCargas } from '../../domain/carga.lista';
import { ETIQUETA_SITUACION_CARGA, SITUACIONES_CARGA, TAMANO_PAGINA_CARGAS, type CargaListaParams } from '../../domain/carga.types';
import { useCamionesCombustible, useCargas } from '../../queries/hooks';
import { useFiltrosUrl } from '../comun/filtros';
import { Cargando, Encabezado, ErrorLectura, Paginador, Vacio } from '../comun/ui';
import { DestinoCarga, RolViajeChips, SituacionCargaChip } from './chips-carga';

/** Combustible > Cargas: lista con fronteras, rol en el viaje y situación. */
export function CargasLista() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { zonaHoraria } = useSesion();
  const params = useMemo(() => parsearListaCargas(new URLSearchParams(searchParams.toString())), [searchParams]);
  const { actualizar, limpiar, navegando } = useFiltrosUrl<CargaListaParams>(params, serializarListaCargas);
  const { data, isPending, isError, isFetching, refetch } = useCargas(params);
  const { data: camiones } = useCamionesCombustible();
  const hayFiltros = Boolean(params.camionId || params.desde || params.hasta || params.soloFronteras || params.situacion);

  return (
    <div className="space-y-5">
      <Encabezado titulo="Cargas">
        <Can permiso="combustible.cargas:editar">
          <Link href={params.camionId ? `/combustible/cargas/nueva?camion=${params.camionId}` : '/combustible/cargas/nueva'} className={BOTON_PRIMARIO}>
            <Plus className="size-4" /> Nueva carga
          </Link>
        </Can>
      </Encabezado>

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
          onChange={(e) => actualizar({ situacion: (e.target.value || undefined) as CargaListaParams['situacion'] })}
        >
          <option value="">Todas las situaciones</option>
          {SITUACIONES_CARGA.map((s) => (
            <option key={s} value={s}>
              {ETIQUETA_SITUACION_CARGA[s]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-tinta-suave">
          Desde
          <input type="date" className={CONTROL_FILTRO} value={params.desde ?? ''} onChange={(e) => actualizar({ desde: e.target.value || undefined })} />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-tinta-suave">
          hasta
          <input type="date" className={CONTROL_FILTRO} value={params.hasta ?? ''} onChange={(e) => actualizar({ hasta: e.target.value || undefined })} />
        </label>
        <label className="flex h-9 items-center gap-2 px-1 text-sm text-tinta-suave">
          <input type="checkbox" className="size-4 accent-marca" checked={Boolean(params.soloFronteras)} onChange={(e) => actualizar({ soloFronteras: e.target.checked })} />
          Solo fronteras
        </label>
        {hayFiltros && (
          <button type="button" onClick={limpiar} className="flex h-9 items-center gap-1 rounded-md px-2 text-sm text-marca hover:bg-marca-suave">
            <X className="size-4" /> Limpiar
          </button>
        )}
        {(navegando || (isFetching && !isPending)) && <LoaderCircle className="ml-auto size-4 animate-spin text-tinta-suave" aria-label="Actualizando" />}
      </section>

      <section className={cn(TARJETA, 'overflow-hidden')}>
        {isError ? (
          <ErrorLectura texto="No se pudo cargar la lista de cargas." onReintentar={() => refetch()} />
        ) : isPending ? (
          <Cargando texto="Cargando cargas…" />
        ) : data.filas.length === 0 ? (
          <Vacio icono={<Fuel className="size-6" />} texto={hayFiltros ? 'Ninguna carga coincide con los filtros.' : 'Todavía no hay cargas.'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="border-b border-borde bg-fondo text-left text-xs font-medium tracking-wide text-tinta-suave uppercase">
                <tr>
                  <th className="px-3 py-2.5">Fecha y hora</th>
                  <th className="px-3 py-2.5">Camión</th>
                  <th className="px-3 py-2.5">Chofer</th>
                  <th className="px-3 py-2.5">Estación</th>
                  <th className="px-3 py-2.5">Destino</th>
                  <th className="px-3 py-2.5 text-right">Litros</th>
                  <th className="px-3 py-2.5">Frontera</th>
                  <th className="px-3 py-2.5">Situación</th>
                </tr>
              </thead>
              <tbody className={cn('divide-y divide-borde', isFetching && 'opacity-70')}>
                {data.filas.map((c) => (
                  <tr key={c.id} className="cursor-pointer hover:bg-hover" onClick={() => router.push(`/combustible/cargas/${c.id}`)}>
                    <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">
                      <Link href={`/combustible/cargas/${c.id}`} className="text-marca hover:underline" onClick={(e) => e.stopPropagation()}>
                        {formatearFechaHora(c.fechaHora, zonaHoraria)}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 font-mono">{c.camionPatente ?? '—'}</td>
                    <td className="px-3 py-2.5">{c.choferNombre ?? '—'}</td>
                    <td className="px-3 py-2.5">{c.estacion ?? '—'}</td>
                    <td className="px-3 py-2.5">
                      <DestinoCarga carga={c} />
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatearNumero(c.litros)}
                      {c.tanqueLleno && <span className="ml-1 text-xs text-tinta-suave">lleno</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      {c.esFrontera ? (
                        <span className="inline-flex flex-wrap items-center gap-1">
                          <Flag className="size-3.5 text-marca" aria-label="Frontera" />
                          <RolViajeChips rol={c.rolViaje} />
                        </span>
                      ) : (
                        <span className="text-tinta-suave">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <SituacionCargaChip situacion={c.situacion} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.filas.length > 0 && (
          <Paginador pagina={params.pagina} total={data.total ?? 0} tamano={TAMANO_PAGINA_CARGAS} onCambiar={(p) => actualizar({ pagina: p }, true)} />
        )}
      </section>
    </div>
  );
}
