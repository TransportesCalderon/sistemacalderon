'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, CircleAlert, LoaderCircle, Pencil } from 'lucide-react';
import { Can } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import type { ClienteId } from '@/shared/types/dominio';
import { AYUDA_ESTADO_CLIENTE, textoCondicionPago } from '../../domain/cliente.types';
import { formatearIdentificadorFiscal, nombreIdentificador } from '../../domain/identificador-fiscal';
import { useCatalogosComercial, useCliente } from '../../queries/hooks';
import { EstadoClienteChip } from './estado-cliente';
import { SoloEnPagina, useNombreFicha } from '@/modules/core/fichas/contexto';

/** Pestañas de la ficha según la especificación (P-CLI-01). Solo Datos está disponible en esta etapa. */
const PESTANAS = ['Datos', 'Servicios', 'Ingresos', 'Rentabilidad mensual', 'Auditoría'] as const;

/** P-CLI-01 · Ficha del cliente. */
export function ClienteFicha({ id }: { id: ClienteId }) {
  const { zonaHoraria } = useSesion();
  const { data: cliente, isPending, isError, refetch } = useCliente(id);
  const { data: catalogos } = useCatalogosComercial();
  useNombreFicha(cliente?.razonSocial);

  if (isPending) {
    return (
      <div className="flex items-center gap-2 text-sm text-tinta-suave">
        <LoaderCircle className="size-4 animate-spin" /> Cargando cliente…
      </div>
    );
  }
  if (isError || !cliente) {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-error">{isError ? 'No se pudo cargar el cliente.' : 'El cliente no existe.'}</p>
        <div className="flex gap-4">
          {isError && (
            <button type="button" onClick={() => refetch()} className="text-marca hover:underline">
              Reintentar
            </button>
          )}
          <SoloEnPagina>
            <Link href="/comercial/clientes" className="text-marca hover:underline">
              Volver a la lista
            </Link>
          </SoloEnPagina>
        </div>
      </div>
    );
  }

  const pais = catalogos?.paises.find((p) => p.iso2 === cliente.pais)?.nombre ?? cliente.pais;
  const moneda = catalogos?.monedas.find((m) => m.codigo === cliente.monedaFacturacion);
  const eliminado = cliente.eliminadoEn !== null;
  const identificador = formatearIdentificadorFiscal(cliente.pais, cliente.identificadorFiscal);

  return (
    <div className="space-y-5">
      <SoloEnPagina>
        <Link href="/comercial/clientes" className="inline-flex items-center gap-1 text-sm text-tinta-suave hover:text-tinta">
          <ArrowLeft className="size-4" /> Clientes
        </Link>
      </SoloEnPagina>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-tinta">{cliente.razonSocial}</h1>
            <EstadoClienteChip estado={cliente.estado} eliminado={eliminado} />
          </div>
          <p className="text-sm text-tinta-suave">
            Código <span className="font-medium text-tinta">{cliente.codigo}</span> · {nombreIdentificador(cliente.pais)}{' '}
            <span className="font-mono text-tinta">{identificador}</span> · {pais}
          </p>
        </div>
        {!eliminado && (
          <Can permiso="comercial.clientes:editar">
            <Link href={`/comercial/clientes/${cliente.id}/editar`} className={BOTON_SECUNDARIO}>
              <Pencil className="size-4" />
              Editar
            </Link>
          </Can>
        )}
      </header>

      {eliminado && (
        <p className="flex items-start gap-2 rounded-lg border border-error/30 bg-error-suave p-3 text-sm text-error">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          Este cliente fue eliminado como registro erróneo el {formatearFechaHora(cliente.eliminadoEn, zonaHoraria)}. Se conserva para
          historial y no se puede modificar.
        </p>
      )}
      {!eliminado && cliente.estado === 'bloqueado' && (
        <p className="flex items-start gap-2 rounded-lg border border-alerta/30 bg-alerta-suave p-3 text-sm text-alerta">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          Cliente bloqueado: no se ofrece al crear servicios comerciales.
        </p>
      )}

      <nav className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Secciones de la ficha">
        <ul className="flex min-w-max gap-1 border-b border-borde">
          {PESTANAS.map((p, i) => (
            <li key={p}>
              <span
                aria-current={i === 0 ? 'page' : undefined}
                aria-disabled={i === 0 ? undefined : true}
                title={i === 0 ? undefined : 'Disponible cuando se incorpore el módulo correspondiente'}
                className={cn(
                  'block border-b-2 px-3 py-2 text-sm whitespace-nowrap',
                  i === 0 ? 'border-marca font-medium text-marca' : 'cursor-not-allowed border-transparent text-tinta-suave/60',
                )}
              >
                {p}
              </span>
            </li>
          ))}
        </ul>
      </nav>

      <div className="grid gap-5 lg:grid-cols-2">
        <Seccion titulo="Identificación">
          <Dato etiqueta="Código">{cliente.codigo}</Dato>
          <Dato etiqueta="Razón social">{cliente.razonSocial}</Dato>
          <Dato etiqueta={nombreIdentificador(cliente.pais)}>
            <span className="font-mono">{identificador}</span>
          </Dato>
          <Dato etiqueta="País">{pais}</Dato>
        </Seccion>

        <Seccion titulo="Condiciones comerciales">
          <Dato etiqueta="Moneda de facturación">
            {moneda ? `${moneda.codigo} · ${moneda.nombre}` : cliente.monedaFacturacion}
          </Dato>
          <Dato etiqueta="Condición de pago">{textoCondicionPago(cliente.condicionPagoDias)}</Dato>
          <Dato etiqueta="Segmento">{cliente.segmento}</Dato>
        </Seccion>

        <Seccion titulo="Situación">
          <Dato etiqueta="Estado">
            <span className="flex flex-col items-start gap-1">
              <EstadoClienteChip estado={cliente.estado} />
              <span className="text-xs text-tinta-suave">{AYUDA_ESTADO_CLIENTE[cliente.estado]}</span>
            </span>
          </Dato>
        </Seccion>

        <Seccion titulo="Registro">
          <Dato etiqueta="Creado">{formatearFechaHora(cliente.creadoEn, zonaHoraria)}</Dato>
          <Dato etiqueta="Última modificación">{formatearFechaHora(cliente.actualizadoEn, zonaHoraria)}</Dato>
          <Dato etiqueta="Versión">{cliente.versionFila}</Dato>
        </Seccion>
      </div>
    </div>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className={cn(TARJETA, 'p-5')}>
      <h2 className="mb-3 text-sm font-semibold text-tinta">{titulo}</h2>
      <dl className="divide-y divide-borde">{children}</dl>
    </section>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  const vacio = children === null || children === undefined || children === '';
  return (
    <div className="grid grid-cols-[minmax(0,10rem)_1fr] gap-3 py-2 text-sm">
      <dt className="text-tinta-suave">{etiqueta}</dt>
      <dd className="min-w-0 break-words text-tinta">{vacio ? <span className="text-tinta-suave">—</span> : children}</dd>
    </div>
  );
}
