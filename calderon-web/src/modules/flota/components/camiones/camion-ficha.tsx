'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, CircleAlert, LoaderCircle, Pencil } from 'lucide-react';
import { Can } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { formatearFechaDia, formatearFechaHora } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import type { CamionId } from '@/shared/types/dominio';
import { ETIQUETA_PROPIETARIO } from '../../domain/camion.types';
import { useCamion, useCatalogosFlota, useTanques } from '../../queries/hooks';
import { EstadoCamionChip } from './estado-camion';
import { TanquesCamion } from './tanques-camion';
import { SoloEnPagina, useNombreFicha } from '@/modules/core/fichas/contexto';
import { TractorEnFicha } from '@/modules/logistica/components/tractores-pantalla';

/** Pestañas de la ficha según la especificación (P-MAE-01). Disponibles: Datos y Tanques (sección de esta misma página). */
const PESTANAS = [
  'Datos',
  'Tanques',
  'Dispositivos',
  'Asignaciones',
  'Tramos',
  'Cargas',
  'Consumo',
  'Telemetría',
  'Alertas',
  'Costos y rentabilidad',
  'Auditoría',
] as const;

/** P-MAE-01 · Ficha del camión. */
export function CamionFicha({ id }: { id: CamionId }) {
  const { zonaHoraria } = useSesion();
  const { data: camion, isPending, isError, refetch } = useCamion(id);
  const { data: catalogos } = useCatalogosFlota();
  const { data: tanques } = useTanques(id);
  useNombreFicha(camion?.patente);
  // Alta con tanques que la base rechazó: el camión se creó y el mensaje llega por la URL.
  const avisoTanques = useSearchParams().get('tanques');

  if (isPending) {
    return (
      <div className="flex items-center gap-2 text-sm text-tinta-suave">
        <LoaderCircle className="size-4 animate-spin" /> Cargando camión…
      </div>
    );
  }
  if (isError || !camion) {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-error">{isError ? 'No se pudo cargar el camión.' : 'El camión no existe.'}</p>
        <div className="flex gap-4">
          {isError && (
            <button type="button" onClick={() => refetch()} className="text-marca hover:underline">
              Reintentar
            </button>
          )}
          <SoloEnPagina>
            <Link href="/flota/camiones" className="text-marca hover:underline">
              Volver a la lista
            </Link>
          </SoloEnPagina>
        </div>
      </div>
    );
  }

  const combustible = catalogos?.tiposCombustible.find((t) => t.id === camion.tipoCombustibleId)?.nombre;
  const pais = catalogos?.paises.find((p) => p.iso2 === camion.paisPatente)?.nombre ?? camion.paisPatente;
  const eliminado = camion.eliminadoEn !== null;

  return (
    <div className="space-y-5">
      <SoloEnPagina>
        <Link href="/flota/camiones" className="inline-flex items-center gap-1 text-sm text-tinta-suave hover:text-tinta">
          <ArrowLeft className="size-4" /> Camiones
        </Link>
      </SoloEnPagina>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-tinta">{camion.codigoInterno}</h1>
            <EstadoCamionChip estado={camion.estado} eliminado={eliminado} />
          </div>
          <p className="text-sm text-tinta-suave">
            <span className="font-mono text-tinta">{camion.patente}</span> · {pais}
            {(camion.marca || camion.modelo) && <> · {[camion.marca, camion.modelo].filter(Boolean).join(' ')}</>}
            {camion.anio && <> · {camion.anio}</>}
          </p>
        </div>
        {!eliminado && (
          <Can permiso="flota.camiones:editar">
            <Link href={`/flota/camiones/${camion.id}/editar`} className={BOTON_SECUNDARIO}>
              <Pencil className="size-4" />
              Editar
            </Link>
          </Can>
        )}
      </header>

      {eliminado && (
        <p className="flex items-start gap-2 rounded-lg border border-error/30 bg-error-suave p-3 text-sm text-error">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          Este camión fue eliminado como registro erróneo el {formatearFechaHora(camion.eliminadoEn, zonaHoraria)}. Se conserva para
          historial y no se puede modificar.
        </p>
      )}

      {avisoTanques && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-error/30 bg-error-suave p-3 text-sm text-error">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            El camión se dio de alta, pero los tanques no se guardaron: {avisoTanques} Cargalos abajo, en Tanques.
          </span>
        </p>
      )}

      <nav className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Secciones de la ficha">
        <ul className="flex min-w-max gap-1 border-b border-borde">
          {PESTANAS.map((p, i) => (
            <li key={p}>
              {p === 'Tanques' ? (
                <a href="#tanques" className="block border-b-2 border-transparent px-3 py-2 text-sm whitespace-nowrap text-tinta hover:text-marca">
                  {p}
                </a>
              ) : (
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
              )}
            </li>
          ))}
        </ul>
      </nav>

      <div className="grid gap-5 lg:grid-cols-2">
        <Seccion titulo="Identificación">
          <Dato etiqueta="Código interno">{camion.codigoInterno}</Dato>
          <Dato etiqueta="Patente">
            <span className="font-mono">{camion.patente}</span>
          </Dato>
          <Dato etiqueta="País de la patente">{pais}</Dato>
          <Dato etiqueta="VIN">{camion.vin ? <span className="font-mono">{camion.vin}</span> : null}</Dato>
          <Dato etiqueta="Identificador Optifleet">{camion.idOptifleet}</Dato>
        </Seccion>

        <Seccion titulo="Vehículo">
          <Dato etiqueta="Marca">{camion.marca}</Dato>
          <Dato etiqueta="Modelo">{camion.modelo}</Dato>
          <Dato etiqueta="Año">{camion.anio}</Dato>
          <Dato etiqueta="Tipo de combustible">{combustible}</Dato>
          <Dato etiqueta="Capacidad de combustible">
            {tanques === undefined ? null : tanques.capacidad.capacidadUtilL === null ? (
              <a href="#tanques" className="text-alerta hover:underline">
                Sin tanques cargados
              </a>
            ) : (
              <a href="#tanques" className="hover:underline">
                {formatearNumero(tanques.capacidad.capacidadUtilL, 0)} L útiles · {tanques.capacidad.tanques}{' '}
                {tanques.capacidad.tanques === 1 ? 'tanque' : 'tanques'}
              </a>
            )}
          </Dato>
          <Dato etiqueta="Consumo de referencia">
            {camion.consumoReferencia ? `${camion.consumoReferencia.replace('.', ',')} l/100 km` : null}
          </Dato>
        </Seccion>

        <Seccion titulo="Situación">
          <Dato etiqueta="Estado">
            <EstadoCamionChip estado={camion.estado} />
          </Dato>
          <Dato etiqueta="Propietario">{ETIQUETA_PROPIETARIO[camion.propietarioTipo]}</Dato>
          <Dato etiqueta="Fecha de alta">{formatearFechaDia(camion.fechaAlta)}</Dato>
          <Dato etiqueta="Fecha de baja">{camion.fechaBaja ? formatearFechaDia(camion.fechaBaja) : null}</Dato>
        </Seccion>

        <Seccion titulo="Registro">
          <Dato etiqueta="Creado">{formatearFechaHora(camion.creadoEn, zonaHoraria)}</Dato>
          <Dato etiqueta="Última modificación">{formatearFechaHora(camion.actualizadoEn, zonaHoraria)}</Dato>
          <Dato etiqueta="Versión">{camion.versionFila}</Dato>
        </Seccion>
      </div>

      {/* Sprint 6: lo de «Tractores y viajes» para este tractor (iniciar viaje, chofer fijo) */}
      {!eliminado && (
        <Can permiso="operacion.tramos:ver">
          <TractorEnFicha camionId={camion.id} />
        </Can>
      )}

      <TanquesCamion camion={camion} />

      <p className="text-xs text-tinta-suave">
        El consumo de referencia es una base teórica: no reemplaza la línea base real calculada con los datos del camión.
      </p>
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
