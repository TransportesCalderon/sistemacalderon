'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, LoaderCircle, Plus, Search, UsersRound, X } from 'lucide-react';
import { useAlcance } from '@/modules/core/permissions/can';
import { cn } from '@/shared/lib/cn';
import { formatearFechaDia, hoyEnZona } from '@/shared/lib/fechas';
import { useSesion } from '@/modules/core/session/session-provider';
import { BOTON_ICONO, BOTON_PRIMARIO, CONTROL_FILTRO, TARJETA } from '@/shared/ui/clases';
import { parsearListaChoferes, serializarListaChoferes } from '../../domain/chofer.lista';
import {
  ESTADOS_CHOFER,
  ETIQUETA_ESTADO_CHOFER,
  ETIQUETA_VISA,
  TAMANO_PAGINA_CHOFERES,
  type CampoOrdenChofer,
  type ChoferListaParams,
} from '../../domain/chofer.types';
import { useBases, useCatalogosFlota, useChoferes } from '../../queries/hooks';
import { EstadoChoferChip, LicenciaChip } from './estado-chofer';

/**
 * P-MAE-03 · Choferes (lista). Sin documento visible (especificación §9).
 * Filtros, orden y página viven en la URL.
 */
export function ChoferesLista() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = useMemo(() => parsearListaChoferes(new URLSearchParams(searchParams.toString())), [searchParams]);
  const [navegando, iniciar] = useTransition();
  // El alta es solo para quien edita todos los choferes (no para el alcance "propio").
  const puedeCrear = useAlcance('flota.choferes:editar') === 'todo';

  const { data, isPending, isError, isFetching, refetch } = useChoferes(params);
  const { data: catalogos } = useCatalogosFlota();
  const { data: bases } = useBases();
  const hoy = hoyEnZona(useSesion().zonaHoraria);

  const nombreBase = useMemo(() => new Map(bases?.map((b) => [b.id, b.nombre]) ?? []), [bases]);

  /** Cambia parámetros en la URL. Todo cambio de filtro vuelve a la página 1. */
  const actualizar = (cambios: Partial<ChoferListaParams>, conservarPagina = false) => {
    const siguiente: ChoferListaParams = { ...params, ...cambios };
    if (!conservarPagina) siguiente.pagina = 1;
    for (const k of Object.keys(siguiente) as (keyof ChoferListaParams)[]) {
      if (siguiente[k] === undefined || siguiente[k] === '' || siguiente[k] === false) delete siguiente[k];
    }
    const qs = serializarListaChoferes(siguiente);
    iniciar(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  const ordenarPor = (campo: CampoOrdenChofer) =>
    actualizar({ orden: campo, dir: params.orden === campo && params.dir === 'asc' ? 'desc' : 'asc' });

  const total = data?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / TAMANO_PAGINA_CHOFERES));
  const desde = total === 0 ? 0 : (params.pagina - 1) * TAMANO_PAGINA_CHOFERES + 1;
  const hasta = Math.min(total, params.pagina * TAMANO_PAGINA_CHOFERES);
  const hayFiltros = Boolean(params.texto || params.estado || params.pais || params.baseId || params.incluirEliminados);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-tinta-suave">Flota y personas</p>
          <h1 className="text-2xl font-semibold text-tinta">Choferes</h1>
        </div>
        {puedeCrear && (
          <Link href="/flota/choferes/nuevo" className={BOTON_PRIMARIO}>
            <Plus className="size-4" />
            Nuevo chofer
          </Link>
        )}
      </header>

      {/* Filtros */}
      <section className={cn(TARJETA, 'flex flex-wrap items-center gap-2 p-3')} aria-label="Filtros">
        <BuscadorTexto valor={params.texto ?? ''} onCambiar={(texto) => actualizar({ texto })} />
        <select
          aria-label="Estado"
          className={CONTROL_FILTRO}
          value={params.estado ?? ''}
          onChange={(e) => actualizar({ estado: (e.target.value || undefined) as ChoferListaParams['estado'] })}
        >
          <option value="">Todos los estados</option>
          {ESTADOS_CHOFER.map((e) => (
            <option key={e} value={e}>
              {ETIQUETA_ESTADO_CHOFER[e]}
            </option>
          ))}
        </select>
        <select
          aria-label="País de residencia"
          className={CONTROL_FILTRO}
          value={params.pais ?? ''}
          onChange={(e) => actualizar({ pais: e.target.value || undefined })}
        >
          <option value="">Todos los países</option>
          {catalogos?.paises.map((p) => (
            <option key={p.iso2} value={p.iso2}>
              {p.nombre}
            </option>
          ))}
        </select>
        <select
          aria-label="Base"
          className={CONTROL_FILTRO}
          value={params.baseId ?? ''}
          onChange={(e) => actualizar({ baseId: e.target.value ? Number(e.target.value) : undefined })}
        >
          <option value="">Todas las bases</option>
          {bases?.map((b) => (
            <option key={b.id} value={b.id}>
              {b.nombre}
            </option>
          ))}
        </select>
        <label className="flex h-9 items-center gap-2 px-1 text-sm text-tinta-suave">
          <input
            type="checkbox"
            className="size-4 accent-marca"
            checked={Boolean(params.incluirEliminados)}
            onChange={(e) => actualizar({ incluirEliminados: e.target.checked })}
          />
          Incluir eliminados
        </label>
        {hayFiltros && (
          <button
            type="button"
            onClick={() => iniciar(() => router.replace(pathname, { scroll: false }))}
            className="flex h-9 items-center gap-1 rounded-md px-2 text-sm text-marca hover:bg-marca-suave"
          >
            <X className="size-4" />
            Limpiar
          </button>
        )}
        {(navegando || (isFetching && !isPending)) && <LoaderCircle className="ml-auto size-4 animate-spin text-tinta-suave" aria-label="Actualizando" />}
      </section>

      {/* Tabla */}
      <section className={cn(TARJETA, 'overflow-hidden')}>
        {isError ? (
          <div className="space-y-3 p-6 text-sm">
            <p className="text-error">No se pudo cargar la lista de choferes.</p>
            <button type="button" onClick={() => refetch()} className="text-marca hover:underline">
              Reintentar
            </button>
          </div>
        ) : isPending ? (
          <div className="flex items-center gap-2 p-6 text-sm text-tinta-suave">
            <LoaderCircle className="size-4 animate-spin" /> Cargando choferes…
          </div>
        ) : data.filas.length === 0 ? (
          <EstadoVacio conFiltros={hayFiltros} puedeCrear={puedeCrear} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b border-borde bg-fondo text-left text-xs font-medium tracking-wide text-tinta-suave uppercase">
                <tr>
                  <Encabezado campo="legajo" params={params} onOrdenar={ordenarPor}>
                    Legajo
                  </Encabezado>
                  <Encabezado campo="apellido" params={params} onOrdenar={ordenarPor}>
                    Apellido y nombre
                  </Encabezado>
                  <th className="px-3 py-2.5">País</th>
                  <th className="px-3 py-2.5">Base</th>
                  <th className="px-3 py-2.5">Licencia</th>
                  <th className="px-3 py-2.5">Visa</th>
                  <Encabezado campo="fecha_ingreso" params={params} onOrdenar={ordenarPor}>
                    Ingreso
                  </Encabezado>
                  <Encabezado campo="estado" params={params} onOrdenar={ordenarPor}>
                    Estado
                  </Encabezado>
                </tr>
              </thead>
              <tbody className={cn('divide-y divide-borde', isFetching && 'opacity-70')}>
                {data.filas.map((c) => (
                  <tr key={c.id} className="cursor-pointer hover:bg-hover" onClick={() => router.push(`/flota/choferes/${c.id}`)}>
                    <td className="px-3 py-2.5 font-medium">
                      <Link href={`/flota/choferes/${c.id}`} className="text-marca hover:underline" onClick={(e) => e.stopPropagation()}>
                        {c.legajo}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-medium text-tinta">{c.apellido}</span>, {c.nombre}
                    </td>
                    <td className="px-3 py-2.5">{c.paisResidencia}</td>
                    <td className="px-3 py-2.5">{c.baseUbicacionId === null ? '—' : (nombreBase.get(c.baseUbicacionId) ?? '—')}</td>
                    <td className="px-3 py-2.5">
                      <LicenciaChip vence={c.licenciaVencimiento} hoy={hoy} />
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{c.visaEstado ? ETIQUETA_VISA[c.visaEstado] : '—'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">{formatearFechaDia(c.fechaIngreso)}</td>
                    <td className="px-3 py-2.5">
                      <EstadoChoferChip estado={c.estado} eliminado={c.eliminadoEn !== null} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.filas.length > 0 && (
          <footer className="flex items-center justify-between gap-3 border-t border-borde px-3 py-2.5 text-sm text-tinta-suave">
            <span>
              {desde}–{hasta} de {total}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={BOTON_ICONO}
                disabled={params.pagina <= 1}
                onClick={() => actualizar({ pagina: params.pagina - 1 }, true)}
                aria-label="Página anterior"
              >
                <ChevronLeft className="size-4" />
              </button>
              <span className="tabular-nums">
                {params.pagina} / {paginas}
              </span>
              <button
                type="button"
                className={BOTON_ICONO}
                disabled={params.pagina >= paginas}
                onClick={() => actualizar({ pagina: params.pagina + 1 }, true)}
                aria-label="Página siguiente"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </footer>
        )}
      </section>
    </div>
  );
}

/** Búsqueda con espera de 350 ms para no consultar en cada tecla. */
function BuscadorTexto({ valor, onCambiar }: { valor: string; onCambiar: (texto: string | undefined) => void }) {
  const [texto, setTexto] = useState(valor);

  useEffect(() => setTexto(valor), [valor]);

  useEffect(() => {
    if (texto.trim() === valor) return;
    const t = setTimeout(() => onCambiar(texto.trim() || undefined), 350);
    return () => clearTimeout(t);
    // onCambiar cambia en cada render; solo importa el texto
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto, valor]);

  return (
    <label className="relative min-w-56 flex-1">
      <span className="sr-only">Buscar chofer</span>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-tinta-suave" />
      <input
        type="search"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Buscar legajo, nombre o apellido…"
        className={cn(CONTROL_FILTRO, 'w-full pl-8')}
      />
    </label>
  );
}

function Encabezado({
  campo,
  params,
  onOrdenar,
  children,
}: {
  campo: CampoOrdenChofer;
  params: ChoferListaParams;
  onOrdenar: (campo: CampoOrdenChofer) => void;
  children: string;
}) {
  const activo = params.orden === campo;
  const Flecha = params.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th className="px-3 py-2.5" aria-sort={activo ? (params.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={() => onOrdenar(campo)}
        className={cn('inline-flex items-center gap-1 uppercase hover:text-tinta', activo && 'text-tinta')}
      >
        {children}
        {activo && <Flecha className="size-3.5" />}
      </button>
    </th>
  );
}

function EstadoVacio({ conFiltros, puedeCrear }: { conFiltros: boolean; puedeCrear: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-marca-suave text-marca">
        <UsersRound className="size-6" />
      </span>
      {conFiltros ? (
        <p className="text-sm text-tinta-suave">Ningún chofer coincide con los filtros.</p>
      ) : (
        <>
          <p className="font-medium text-tinta">Todavía no hay choferes cargados</p>
          {puedeCrear ? (
            <Link href="/flota/choferes/nuevo" className={BOTON_PRIMARIO}>
              <Plus className="size-4" />
              Dar de alta el primero
            </Link>
          ) : (
            <p className="text-sm text-tinta-suave">Cuando Operaciones, RR. HH. o TI den de alta choferes, aparecen acá.</p>
          )}
        </>
      )}
    </div>
  );
}
