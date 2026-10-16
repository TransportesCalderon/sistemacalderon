'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, LoaderCircle, Plus, Search, Truck, X } from 'lucide-react';
import { Can } from '@/modules/core/permissions/can';
import { cn } from '@/shared/lib/cn';
import { formatearNumero } from '@/shared/lib/numeros';
import { formatearFechaDia } from '@/shared/lib/fechas';
import { BOTON_ICONO, BOTON_PRIMARIO, CONTROL_FILTRO, TARJETA } from '@/shared/ui/clases';
import { parsearListaCamiones, serializarListaCamiones } from '../../domain/camion.lista';
import {
  ESTADOS_CAMION,
  ETIQUETA_ESTADO_CAMION,
  ETIQUETA_PROPIETARIO,
  PROPIETARIOS_CAMION,
  TAMANO_PAGINA_CAMIONES,
  type CamionListaParams,
  type CampoOrdenCamion,
} from '../../domain/camion.types';
import { useCamiones, useCapacidades, useCatalogosFlota } from '../../queries/hooks';
import { EstadoCamionChip } from './estado-camion';

/**
 * P-MAE-01 · Camiones (lista). Los filtros, el orden y la página viven en la URL:
 * se pueden compartir y el botón Atrás vuelve al mismo estado.
 */
export function CamionesLista() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = useMemo(() => parsearListaCamiones(new URLSearchParams(searchParams.toString())), [searchParams]);
  const [navegando, iniciar] = useTransition();

  const { data, isPending, isError, isFetching, refetch } = useCamiones(params);
  const { data: capacidades } = useCapacidades(data?.filas.map((c) => c.id) ?? []);
  const { data: catalogos } = useCatalogosFlota();

  const nombreCombustible = useMemo(
    () => new Map(catalogos?.tiposCombustible.map((t) => [t.id, t.nombre]) ?? []),
    [catalogos],
  );

  /** Cambia parámetros en la URL. Todo cambio de filtro vuelve a la página 1. */
  const actualizar = (cambios: Partial<CamionListaParams>, conservarPagina = false) => {
    const siguiente: CamionListaParams = { ...params, ...cambios };
    if (!conservarPagina) siguiente.pagina = 1;
    for (const k of Object.keys(siguiente) as (keyof CamionListaParams)[]) {
      if (siguiente[k] === undefined || siguiente[k] === '' || siguiente[k] === false) delete siguiente[k];
    }
    const qs = serializarListaCamiones(siguiente);
    iniciar(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  const ordenarPor = (campo: CampoOrdenCamion) =>
    actualizar({ orden: campo, dir: params.orden === campo && params.dir === 'asc' ? 'desc' : 'asc' });

  const total = data?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / TAMANO_PAGINA_CAMIONES));
  const desde = total === 0 ? 0 : (params.pagina - 1) * TAMANO_PAGINA_CAMIONES + 1;
  const hasta = Math.min(total, params.pagina * TAMANO_PAGINA_CAMIONES);
  const hayFiltros = Boolean(params.texto || params.estado || params.propietario || params.pais || params.tipoCombustibleId || params.incluirEliminados);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-tinta-suave">Flota y personas</p>
          <h1 className="text-2xl font-semibold text-tinta">Camiones</h1>
        </div>
        <Can permiso="flota.camiones:editar">
          <Link href="/flota/camiones/nuevo" className={BOTON_PRIMARIO}>
            <Plus className="size-4" />
            Nuevo camión
          </Link>
        </Can>
      </header>

      {/* Filtros */}
      <section className={cn(TARJETA, 'flex flex-wrap items-center gap-2 p-3')} aria-label="Filtros">
        <BuscadorTexto valor={params.texto ?? ''} onCambiar={(texto) => actualizar({ texto })} />
        <select
          aria-label="Estado"
          className={CONTROL_FILTRO}
          value={params.estado ?? ''}
          onChange={(e) => actualizar({ estado: (e.target.value || undefined) as CamionListaParams['estado'] })}
        >
          <option value="">Todos los estados</option>
          {ESTADOS_CAMION.map((e) => (
            <option key={e} value={e}>
              {ETIQUETA_ESTADO_CAMION[e]}
            </option>
          ))}
        </select>
        <select
          aria-label="Propietario"
          className={CONTROL_FILTRO}
          value={params.propietario ?? ''}
          onChange={(e) => actualizar({ propietario: (e.target.value || undefined) as CamionListaParams['propietario'] })}
        >
          <option value="">Todo propietario</option>
          {PROPIETARIOS_CAMION.map((p) => (
            <option key={p} value={p}>
              {ETIQUETA_PROPIETARIO[p]}
            </option>
          ))}
        </select>
        <select
          aria-label="País de la patente"
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
          aria-label="Tipo de combustible"
          className={CONTROL_FILTRO}
          value={params.tipoCombustibleId ?? ''}
          onChange={(e) => actualizar({ tipoCombustibleId: e.target.value ? Number(e.target.value) : undefined })}
        >
          <option value="">Todo combustible</option>
          {catalogos?.tiposCombustible.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
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
            <p className="text-error">No se pudo cargar la lista de camiones.</p>
            <button type="button" onClick={() => refetch()} className="text-marca hover:underline">
              Reintentar
            </button>
          </div>
        ) : isPending ? (
          <div className="flex items-center gap-2 p-6 text-sm text-tinta-suave">
            <LoaderCircle className="size-4 animate-spin" /> Cargando camiones…
          </div>
        ) : data.filas.length === 0 ? (
          <EstadoVacio conFiltros={hayFiltros} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="border-b border-borde bg-fondo text-left text-xs font-medium tracking-wide text-tinta-suave uppercase">
                <tr>
                  <Encabezado campo="codigo_interno" params={params} onOrdenar={ordenarPor}>
                    Código
                  </Encabezado>
                  <Encabezado campo="patente" params={params} onOrdenar={ordenarPor}>
                    Patente
                  </Encabezado>
                  <Encabezado campo="marca" params={params} onOrdenar={ordenarPor}>
                    Marca / modelo
                  </Encabezado>
                  <Encabezado campo="anio" params={params} onOrdenar={ordenarPor} alineado="derecha">
                    Año
                  </Encabezado>
                  <th className="px-3 py-2.5">Combustible</th>
                  <th className="px-3 py-2.5">Propietario</th>
                  <th className="px-3 py-2.5 text-right">Capacidad</th>
                  <Encabezado campo="fecha_alta" params={params} onOrdenar={ordenarPor}>
                    Alta
                  </Encabezado>
                  <Encabezado campo="estado" params={params} onOrdenar={ordenarPor}>
                    Estado
                  </Encabezado>
                </tr>
              </thead>
              <tbody className={cn('divide-y divide-borde', isFetching && 'opacity-70')}>
                {data.filas.map((c) => (
                  <tr key={c.id} className="cursor-pointer hover:bg-hover" onClick={() => router.push(`/flota/camiones/${c.id}`)}>
                    <td className="px-3 py-2.5 font-medium">
                      <Link href={`/flota/camiones/${c.id}`} className="text-marca hover:underline" onClick={(e) => e.stopPropagation()}>
                        {c.codigoInterno}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 font-mono whitespace-nowrap">
                      {c.patente} <span className="text-xs text-tinta-suave">{c.paisPatente}</span>
                    </td>
                    <td className="px-3 py-2.5">{[c.marca, c.modelo].filter(Boolean).join(' ') || '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{c.anio ?? '—'}</td>
                    <td className="px-3 py-2.5">{nombreCombustible.get(c.tipoCombustibleId) ?? '—'}</td>
                    <td className="px-3 py-2.5">{ETIQUETA_PROPIETARIO[c.propietarioTipo]}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
                      {capacidades === undefined ? (
                        '—'
                      ) : capacidades[c.id] == null ? (
                        <span className="text-alerta" title="Sin tanques cargados">
                          Sin tanques
                        </span>
                      ) : (
                        `${formatearNumero(capacidades[c.id] ?? null, 0)} L`
                      )}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">{formatearFechaDia(c.fechaAlta)}</td>
                    <td className="px-3 py-2.5">
                      <EstadoCamionChip estado={c.estado} eliminado={c.eliminadoEn !== null} />
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
      <span className="sr-only">Buscar camión</span>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-tinta-suave" />
      <input
        type="search"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Buscar código, patente, marca…"
        className={cn(CONTROL_FILTRO, 'w-full pl-8')}
      />
    </label>
  );
}

function Encabezado({
  campo,
  params,
  onOrdenar,
  alineado = 'izquierda',
  children,
}: {
  campo: CampoOrdenCamion;
  params: CamionListaParams;
  onOrdenar: (campo: CampoOrdenCamion) => void;
  alineado?: 'izquierda' | 'derecha';
  children: string;
}) {
  const activo = params.orden === campo;
  const Flecha = params.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th className={cn('px-3 py-2.5', alineado === 'derecha' && 'text-right')} aria-sort={activo ? (params.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
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

function EstadoVacio({ conFiltros }: { conFiltros: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-marca-suave text-marca">
        <Truck className="size-6" />
      </span>
      {conFiltros ? (
        <p className="text-sm text-tinta-suave">Ningún camión coincide con los filtros.</p>
      ) : (
        <>
          <p className="font-medium text-tinta">Todavía no hay camiones cargados</p>
          <Can
            permiso="flota.camiones:editar"
            fallback={<p className="text-sm text-tinta-suave">Cuando Operaciones o TI den de alta camiones, aparecen acá.</p>}
          >
            <Link href="/flota/camiones/nuevo" className={BOTON_PRIMARIO}>
              <Plus className="size-4" />
              Dar de alta el primero
            </Link>
          </Can>
        </>
      )}
    </div>
  );
}
