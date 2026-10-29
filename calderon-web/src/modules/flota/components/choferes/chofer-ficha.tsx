'use client';

import { ActasDelChofer } from '@/modules/actas/components/actas-del-chofer';
import { useState, type ReactNode } from 'react';
import type { ErrorAccion } from '@/server/actions/result';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CircleAlert, LoaderCircle, Pencil, Trash2 } from 'lucide-react';
import { useAlcance } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { formatearFechaDia, formatearFechaHora, hoyEnZona } from '@/shared/lib/fechas';
import { BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import type { ChoferId } from '@/shared/types/dominio';
import { ETIQUETA_VISA, nombreCompleto } from '../../domain/chofer.types';
import { useBases, useCatalogosFlota, useChofer, useEliminarChofer } from '../../queries/hooks';
import { AccionConMotivo } from '@/modules/combustible/components/comun/ui';
import { DocumentoChofer } from './documento-chofer';
import { EstadoChoferChip, LicenciaChip } from './estado-chofer';
import { SoloEnPagina, useFicha, useNombreFicha } from '@/modules/core/fichas/contexto';

/** Pestañas de la ficha según la especificación (P-MAE-03). Solo Datos está disponible en esta etapa. */
const PESTANAS = [
  'Datos',
  'Asignaciones',
  'Tramos y relevos',
  'Cargas',
  'Sesiones de telemetría',
  'Tramos liquidables',
  'Liquidaciones',
  'Consumo',
  'Alertas',
  'Auditoría',
] as const;

/** P-MAE-03 · Ficha del chofer. */
export function ChoferFicha({ id }: { id: ChoferId }) {
  const sesion = useSesion();
  const alcanceEditar = useAlcance('flota.choferes:editar');
  const { data: chofer, isPending, isError, refetch } = useChofer(id);
  const { data: catalogos } = useCatalogosFlota();
  const { data: bases } = useBases();
  useNombreFicha(chofer ? nombreCompleto(chofer) : null);

  if (isPending) {
    return (
      <div className="flex items-center gap-2 text-sm text-tinta-suave">
        <LoaderCircle className="size-4 animate-spin" /> Cargando chofer…
      </div>
    );
  }
  if (isError || !chofer) {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-error">{isError ? 'No se pudo cargar el chofer.' : 'El chofer no existe.'}</p>
        <div className="flex gap-4">
          {isError && (
            <button type="button" onClick={() => refetch()} className="text-marca hover:underline">
              Reintentar
            </button>
          )}
          <SoloEnPagina>
            <Link href="/flota/choferes" className="text-marca hover:underline">
              Volver a la lista
            </Link>
          </SoloEnPagina>
        </div>
      </div>
    );
  }

  const pais = catalogos?.paises.find((p) => p.iso2 === chofer.paisResidencia)?.nombre ?? chofer.paisResidencia;
  const base = chofer.baseUbicacionId === null ? null : (bases?.find((b) => b.id === chofer.baseUbicacionId)?.nombre ?? `Ubicación ${chofer.baseUbicacionId}`);
  const eliminado = chofer.eliminadoEn !== null;
  const puedeEditar = alcanceEditar === 'todo' || (alcanceEditar === 'propio' && sesion.choferId === chofer.id);

  return (
    <div className="space-y-5">
      <SoloEnPagina>
        <Link href="/flota/choferes" className="inline-flex items-center gap-1 text-sm text-tinta-suave hover:text-tinta">
          <ArrowLeft className="size-4" /> Choferes
        </Link>
      </SoloEnPagina>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-tinta">{nombreCompleto(chofer)}</h1>
            <EstadoChoferChip estado={chofer.estado} eliminado={eliminado} />
          </div>
          <p className="text-sm text-tinta-suave">
            Legajo <span className="font-medium text-tinta">{chofer.legajo}</span> · {pais}
            {base && <> · {base}</>}
          </p>
        </div>
        {!eliminado && puedeEditar && (
          <div className="flex flex-wrap items-start gap-2">
            <Link href={`/flota/choferes/${chofer.id}/editar`} className={BOTON_SECUNDARIO}>
              <Pencil className="size-4" />
              Editar
            </Link>
            {alcanceEditar === 'todo' && <EliminarChofer id={chofer.id} nombre={nombreCompleto(chofer)} />}
          </div>
        )}
      </header>

      {eliminado && (
        <p className="flex items-start gap-2 rounded-lg border border-error/30 bg-error-suave p-3 text-sm text-error">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          Este chofer fue eliminado como registro erróneo el {formatearFechaHora(chofer.eliminadoEn, sesion.zonaHoraria)}. Se conserva para
          historial y no se puede modificar.
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
        <Seccion titulo="Datos personales">
          <Dato etiqueta="Legajo">{chofer.legajo}</Dato>
          <Dato etiqueta="Apellido">{chofer.apellido}</Dato>
          <Dato etiqueta="Nombre">{chofer.nombre}</Dato>
          <Dato etiqueta="Documento, RUT, nacimiento y contacto de emergencia">
            {eliminado ? null : <DocumentoChofer choferId={chofer.id} />}
          </Dato>
          <Dato etiqueta="País de residencia">{pais}</Dato>
        </Seccion>

        <Seccion titulo="Contacto, licencia y visa">
          <Dato etiqueta="Teléfono">
            {chofer.telefono && (
              <a href={`tel:${chofer.telefono}`} className="font-mono text-marca hover:underline">
                {chofer.telefono}
              </a>
            )}
          </Dato>
          <Dato etiqueta="Licencia de conducir">
            {chofer.licenciaVencimiento && <LicenciaChip vence={chofer.licenciaVencimiento} hoy={hoyEnZona(sesion.zonaHoraria)} />}
          </Dato>
          <Dato etiqueta="Visa para Chile">{chofer.visaEstado ? ETIQUETA_VISA[chofer.visaEstado] : null}</Dato>
        </Seccion>

        <Seccion titulo="Datos laborales">
          <Dato etiqueta="Base">{base}</Dato>
          <Dato etiqueta="Categoría de liquidación">{chofer.categoriaLiquidacion}</Dato>
          <Dato etiqueta="Identificador Optifleet">{chofer.idConductorOptifleet}</Dato>
        </Seccion>

        <Seccion titulo="Situación">
          <Dato etiqueta="Estado">
            <EstadoChoferChip estado={chofer.estado} />
          </Dato>
          <Dato etiqueta="Fecha de ingreso">{formatearFechaDia(chofer.fechaIngreso)}</Dato>
          <Dato etiqueta="Fecha de egreso">{chofer.fechaEgreso ? formatearFechaDia(chofer.fechaEgreso) : null}</Dato>
        </Seccion>

        <Seccion titulo="Registro">
          <Dato etiqueta="Creado">{formatearFechaHora(chofer.creadoEn, sesion.zonaHoraria)}</Dato>
          <Dato etiqueta="Última modificación">{formatearFechaHora(chofer.actualizadoEn, sesion.zonaHoraria)}</Dato>
          <Dato etiqueta="Versión">{chofer.versionFila}</Dato>
        </Seccion>
      </div>

      {/* Migración 122: su historial de actas de infracción */}
      <ActasDelChofer choferId={chofer.id} />
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

/**
 * Migración 45: eliminar chofer. Nunca usado: se borra del todo (y sus datos personales).
 * Ya usado: deja de verse y se conserva para la historia. Las reglas las aplica la base.
 */
function EliminarChofer({ id, nombre }: { id: ChoferId; nombre: string }) {
  const eliminar = useEliminarChofer();
  const router = useRouter();
  const ficha = useFicha();
  const [error, setError] = useState<ErrorAccion | null>(null);
  return (
    <AccionConMotivo
      etiqueta="Eliminar"
      icono={<Trash2 className="size-4" />}
      titulo={`Eliminar a ${nombre}`}
      explicacion="Si nunca tuvo viajes, cargas ni liquidaciones, se borra del todo. Si ya se usó, deja de verse en listas y selectores, pero se conserva para que la historia diga quién fue. Si dejó de trabajar, mejor editalo con estado Baja y fecha de egreso."
      ocupado={eliminar.isPending}
      error={error}
      onConfirmar={async (motivo) => {
        setError(null);
        const r = await eliminar.mutateAsync({ id, motivo });
        if (!r.ok) {
          setError(r.error);
          return false;
        }
        // En el panel se cierra la ficha; en la página se vuelve a la lista
        if (ficha) ficha.cerrar();
        else router.push('/flota/choferes');
        return true;
      }}
    />
  );
}
