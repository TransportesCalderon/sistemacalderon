'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowDown, ArrowUp, Building2, ChevronLeft, ChevronRight, LoaderCircle, Plus, Search, X } from 'lucide-react';
import { Can } from '@/modules/core/permissions/can';
import { cn } from '@/shared/lib/cn';
import { BOTON_ICONO, BOTON_PRIMARIO, CONTROL_FILTRO, TARJETA } from '@/shared/ui/clases';
import { parsearListaClientes, serializarListaClientes } from '../../domain/cliente.lista';
import {
  ESTADOS_CLIENTE,
  ETIQUETA_ESTADO_CLIENTE,
  TAMANO_PAGINA_CLIENTES,
  textoCondicionPago,
  type CampoOrdenCliente,
  type ClienteListaParams,
} from '../../domain/cliente.types';
import { formatearIdentificadorFiscal } from '../../domain/identificador-fiscal';
import { useCatalogosComercial, useClientes, useSegmentosCliente } from '../../queries/hooks';
import { EstadoClienteChip } from './estado-cliente';
import { NombreEnlazado } from '@/shared/ui/nombre-enlazado';
import { useAbrirFicha } from '@/modules/core/fichas/contexto';

/**
 * P-CLI-01 · Clientes (lista). Filtros, orden y página viven en la URL:
 * se pueden compartir y el botón Atrás vuelve al mismo estado.
 */
export function ClientesLista() {
  const router = useRouter();
  const abrirFicha = useAbrirFicha();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = useMemo(() => parsearListaClientes(new URLSearchParams(searchParams.toString())), [searchParams]);
  const [navegando, iniciar] = useTransition();

  const { data, isPending, isError, isFetching, refetch } = useClientes(params);
  const { data: catalogos } = useCatalogosComercial();
  const { data: segmentos } = useSegmentosCliente();

  /** Cambia parámetros en la URL. Todo cambio de filtro vuelve a la página 1. */
  const actualizar = (cambios: Partial<ClienteListaParams>, conservarPagina = false) => {
    const siguiente: ClienteListaParams = { ...params, ...cambios };
    if (!conservarPagina) siguiente.pagina = 1;
    for (const k of Object.keys(siguiente) as (keyof ClienteListaParams)[]) {
      if (siguiente[k] === undefined || siguiente[k] === '' || siguiente[k] === false) delete siguiente[k];
    }
    const qs = serializarListaClientes(siguiente);
    iniciar(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  const ordenarPor = (campo: CampoOrdenCliente) =>
    actualizar({ orden: campo, dir: params.orden === campo && params.dir === 'asc' ? 'desc' : 'asc' });

  const total = data?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / TAMANO_PAGINA_CLIENTES));
  const desde = total === 0 ? 0 : (params.pagina - 1) * TAMANO_PAGINA_CLIENTES + 1;
  const hasta = Math.min(total, params.pagina * TAMANO_PAGINA_CLIENTES);
  const hayFiltros = Boolean(params.texto || params.estado || params.pais || params.moneda || params.segmento || params.incluirEliminados);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-tinta-suave">Comercial</p>
          <h1 className="text-2xl font-semibold text-tinta">Clientes</h1>
        </div>
        <Can permiso="comercial.clientes:editar">
          <Link href="/comercial/clientes/nuevo" className={BOTON_PRIMARIO}>
            <Plus className="size-4" />
            Nuevo cliente
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
          onChange={(e) => actualizar({ estado: (e.target.value || undefined) as ClienteListaParams['estado'] })}
        >
          <option value="">Todos los estados</option>
          {ESTADOS_CLIENTE.map((e) => (
            <option key={e} value={e}>
              {ETIQUETA_ESTADO_CLIENTE[e]}
            </option>
          ))}
        </select>
        <select aria-label="País" className={CONTROL_FILTRO} value={params.pais ?? ''} onChange={(e) => actualizar({ pais: e.target.value || undefined })}>
          <option value="">Todos los países</option>
          {catalogos?.paises.map((p) => (
            <option key={p.iso2} value={p.iso2}>
              {p.nombre}
            </option>
          ))}
        </select>
        <select
          aria-label="Moneda de facturación"
          className={CONTROL_FILTRO}
          value={params.moneda ?? ''}
          onChange={(e) => actualizar({ moneda: e.target.value || undefined })}
        >
          <option value="">Toda moneda</option>
          {catalogos?.monedas.map((m) => (
            <option key={m.codigo} value={m.codigo}>
              {m.codigo}
            </option>
          ))}
        </select>
        {segmentos && segmentos.length > 0 && (
          <select
            aria-label="Segmento"
            className={CONTROL_FILTRO}
            value={params.segmento ?? ''}
            onChange={(e) => actualizar({ segmento: e.target.value || undefined })}
          >
            <option value="">Todo segmento</option>
            {segmentos.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
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
            <p className="text-error">No se pudo cargar la lista de clientes.</p>
            <button type="button" onClick={() => refetch()} className="text-marca hover:underline">
              Reintentar
            </button>
          </div>
        ) : isPending ? (
          <div className="flex items-center gap-2 p-6 text-sm text-tinta-suave">
            <LoaderCircle className="size-4 animate-spin" /> Cargando clientes…
          </div>
        ) : data.filas.length === 0 ? (
          <EstadoVacio conFiltros={hayFiltros} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b border-borde bg-fondo text-left text-xs font-medium tracking-wide text-tinta-suave uppercase">
                <tr>
                  <Encabezado campo="codigo" params={params} onOrdenar={ordenarPor}>
                    Código
                  </Encabezado>
                  <Encabezado campo="razon_social" params={params} onOrdenar={ordenarPor}>
                    Razón social
                  </Encabezado>
                  <th className="px-3 py-2.5">Identificador fiscal</th>
                  <th className="px-3 py-2.5">País</th>
                  <th className="px-3 py-2.5">Moneda</th>
                  <Encabezado campo="condicion_pago_dias" params={params} onOrdenar={ordenarPor}>
                    Pago
                  </Encabezado>
                  <th className="px-3 py-2.5">Segmento</th>
                  <Encabezado campo="estado" params={params} onOrdenar={ordenarPor}>
                    Estado
                  </Encabezado>
                </tr>
              </thead>
              <tbody className={cn('divide-y divide-borde', isFetching && 'opacity-70')}>
                {data.filas.map((c) => (
                  <tr key={c.id} className="cursor-pointer hover:bg-hover" onClick={() => abrirFicha('cliente', c.id)}>
                    <td className="px-3 py-2.5 font-medium">
                      <NombreEnlazado tipo="cliente" id={c.id} className="text-marca hover:underline">
                        {c.codigo}
                      </NombreEnlazado>
                    </td>
                    <td className="px-3 py-2.5 font-medium text-tinta">{c.razonSocial}</td>
                    <td className="px-3 py-2.5 font-mono whitespace-nowrap">{formatearIdentificadorFiscal(c.pais, c.identificadorFiscal)}</td>
                    <td className="px-3 py-2.5">{c.pais}</td>
                    <td className="px-3 py-2.5">{c.monedaFacturacion}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{textoCondicionPago(c.condicionPagoDias)}</td>
                    <td className="px-3 py-2.5">{c.segmento ?? '—'}</td>
                    <td className="px-3 py-2.5">
                      <EstadoClienteChip estado={c.estado} eliminado={c.eliminadoEn !== null} />
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
      <span className="sr-only">Buscar cliente</span>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-tinta-suave" />
      <input
        type="search"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Buscar código, razón social o CUIT/RUT…"
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
  campo: CampoOrdenCliente;
  params: ClienteListaParams;
  onOrdenar: (campo: CampoOrdenCliente) => void;
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

function EstadoVacio({ conFiltros }: { conFiltros: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-marca-suave text-marca">
        <Building2 className="size-6" />
      </span>
      {conFiltros ? (
        <p className="text-sm text-tinta-suave">Ningún cliente coincide con los filtros.</p>
      ) : (
        <>
          <p className="font-medium text-tinta">Todavía no hay clientes cargados</p>
          <Can
            permiso="comercial.clientes:editar"
            fallback={<p className="text-sm text-tinta-suave">Cuando Operaciones o Finanzas den de alta clientes, aparecen acá.</p>}
          >
            <Link href="/comercial/clientes/nuevo" className={BOTON_PRIMARIO}>
              <Plus className="size-4" />
              Dar de alta el primero
            </Link>
          </Can>
        </>
      )}
    </div>
  );
}
