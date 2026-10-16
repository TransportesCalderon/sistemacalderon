'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ClipboardCheck, LoaderCircle, Route, X } from 'lucide-react';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { BOTON_SECUNDARIO, CONTROL_FILTRO, TARJETA } from '@/shared/ui/clases';
import {
  ESTADOS_CIERRE,
  ETIQUETA_ESTADO_CIERRE,
  TAMANO_PAGINA_CIERRES,
  parsearListaCierres,
  serializarListaCierres,
  type CierreListaParams,
  type EstadoCierre,
} from '../../domain/cierre.types';
import { useCamionesCombustible, useCierres } from '../../queries/hooks';
import { useFiltrosUrl } from '../comun/filtros';
import { Cargando, DiferenciaL, Encabezado, ErrorLectura, Paginador, Vacio } from '../comun/ui';
import { EstadoCierreChip } from './estado-cierre';

/** Combustible > Cierres de viaje. Los cierres se crean desde Viajes. */
export function CierresLista() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { zonaHoraria } = useSesion();
  const params = useMemo(() => parsearListaCierres(new URLSearchParams(searchParams.toString())), [searchParams]);
  const { actualizar, limpiar, navegando } = useFiltrosUrl<CierreListaParams>(params, serializarListaCierres);
  const { data, isPending, isError, isFetching, refetch } = useCierres(params);
  const { data: camiones } = useCamionesCombustible();
  const hayFiltros = Boolean(params.camionId || params.estado || params.desde || params.hasta || params.conImputable);

  return (
    <div className="space-y-5">
      <Encabezado titulo="Cierres de viaje">
        <Link href="/combustible/viajes?situacion=sin_cierre" className={BOTON_SECUNDARIO}>
          <Route className="size-4" /> Viajes sin cierre
        </Link>
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
          aria-label="Estado"
          className={CONTROL_FILTRO}
          value={params.estado ?? ''}
          onChange={(e) => actualizar({ estado: (e.target.value || undefined) as EstadoCierre | undefined })}
        >
          <option value="">Todos los estados</option>
          {ESTADOS_CIERRE.map((s) => (
            <option key={s} value={s}>
              {ETIQUETA_ESTADO_CIERRE[s]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-tinta-suave">
          Llegada desde
          <input type="date" className={CONTROL_FILTRO} value={params.desde ?? ''} onChange={(e) => actualizar({ desde: e.target.value || undefined })} />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-tinta-suave">
          hasta
          <input type="date" className={CONTROL_FILTRO} value={params.hasta ?? ''} onChange={(e) => actualizar({ hasta: e.target.value || undefined })} />
        </label>
        <label className="flex h-9 items-center gap-2 px-1 text-sm text-tinta-suave">
          <input type="checkbox" className="size-4 accent-marca" checked={Boolean(params.conImputable)} onChange={(e) => actualizar({ conImputable: e.target.checked })} />
          Con imputable
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
          <ErrorLectura texto="No se pudo cargar la lista de cierres." onReintentar={() => refetch()} />
        ) : isPending ? (
          <Cargando texto="Cargando cierres…" />
        ) : data.filas.length === 0 ? (
          <Vacio icono={<ClipboardCheck className="size-6" />} texto={hayFiltros ? 'Ningún cierre coincide con los filtros.' : 'Todavía no hay cierres. Se crean desde Viajes.'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="border-b border-borde bg-fondo text-left text-xs font-medium tracking-wide text-tinta-suave uppercase">
                <tr>
                  <th className="px-3 py-2.5">Número</th>
                  <th className="px-3 py-2.5">Camión</th>
                  <th className="px-3 py-2.5">Responsable</th>
                  <th className="px-3 py-2.5">Salida</th>
                  <th className="px-3 py-2.5">Llegada</th>
                  <th className="px-3 py-2.5 text-right">Diferencia</th>
                  <th className="px-3 py-2.5 text-right">Imputable</th>
                  <th className="px-3 py-2.5">Estado</th>
                </tr>
              </thead>
              <tbody className={cn('divide-y divide-borde', isFetching && 'opacity-70')}>
                {data.filas.map((c) => (
                  <tr key={c.id} className="cursor-pointer hover:bg-hover" onClick={() => router.push(`/combustible/cierres/${c.id}`)}>
                    <td className="px-3 py-2.5 font-mono">
                      <Link href={`/combustible/cierres/${c.id}`} className="text-marca hover:underline" onClick={(e) => e.stopPropagation()}>
                        {c.numero}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 font-mono">{c.camionPatente ?? '—'}</td>
                    <td className="px-3 py-2.5">{c.choferNombre ?? '—'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">{formatearFechaHora(c.salidaTs, zonaHoraria)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">{formatearFechaHora(c.llegadaTs, zonaHoraria)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <DiferenciaL litros={c.diferenciaL} />
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{c.imputableTotalL === null ? '—' : `${formatearNumero(c.imputableTotalL)} L`}</td>
                    <td className="px-3 py-2.5">
                      <EstadoCierreChip estado={c.estado} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.filas.length > 0 && (
          <Paginador pagina={params.pagina} total={data.total ?? 0} tamano={TAMANO_PAGINA_CIERRES} onCambiar={(p) => actualizar({ pagina: p }, true)} />
        )}
      </section>
    </div>
  );
}
