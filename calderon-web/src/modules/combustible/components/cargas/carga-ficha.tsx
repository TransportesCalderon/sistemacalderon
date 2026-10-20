'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Ban, Check, Flag, Pencil, Trash2, Undo2, X } from 'lucide-react';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import type { ErrorAccion } from '@/server/actions/result';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { conUnidad, formatearNumero } from '@/shared/lib/numeros';
import { BOTON_SECUNDARIO } from '@/shared/ui/clases';
import type { CargaId } from '@/shared/types/dominio';
import { ETIQUETA_MEDIO_PAGO, type Carga, type MedioPago } from '../../domain/carga.types';
import { useCarga, useEliminarCarga, useResolverSolicitud, useRetirarSolicitud, useSolicitarAnulacion } from '../../queries/hooks';
import { AccionConMotivo, Cargando, Chip, Dato, ErrorBase, ErrorLectura, Seccion } from '../comun/ui';
import { DestinoCarga, RolViajeChips, SituacionCargaChip } from './chips-carga';
import { TicketCarga } from './ticket-carga';

/** Ficha de carga: datos, corte de viaje (con su faltante) y anulación con aprobación de otro usuario. */
export function CargaFicha({ id }: { id: CargaId }) {
  const { zonaHoraria } = useSesion();
  const puedeEditar = useCan('combustible.cargas:editar');
  const { data: carga, isPending, isError, refetch } = useCarga(id);
  if (isPending) return <Cargando texto="Cargando la carga…" />;
  if (isError || !carga) return <ErrorLectura texto={isError ? 'No se pudo cargar la carga.' : 'La carga no existe.'} onReintentar={() => refetch()} />;

  return (
    <div className="space-y-5">
      <Link href="/combustible/cargas" className="inline-flex items-center gap-1 text-sm text-tinta-suave hover:text-tinta">
        <ArrowLeft className="size-4" /> Cargas
      </Link>
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold text-tinta">Carga #{carga.id}</h1>
          <SituacionCargaChip situacion={carga.situacion} />
          {carga.esFrontera && (
            <>
              <Chip tono="marca">
                <Flag className="size-3" /> Corte de viaje
              </Chip>
              <RolViajeChips rol={carga.rolViaje} />
            </>
          )}
        </div>
        <p className="text-sm text-tinta-suave">
          {formatearFechaHora(carga.fechaHora, zonaHoraria)} · {carga.camionPatente ?? '—'} · {carga.estacion ?? 'sin estación'}
        </p>
        {puedeEditar && carga.situacion === 'normal' && carga.destino !== 'deposito' && carga.destino !== 'mochila_anterior' && (
          <Link href={`/combustible/cargas/${carga.id}/editar`} className={`${BOTON_SECUNDARIO} mt-2`}>
            <Pencil className="size-4" /> Editar
          </Link>
        )}
      </header>

      <Seccion titulo="Datos">
        <dl className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <Dato etiqueta="Destino">
            <DestinoCarga carga={carga} />
          </Dato>
          <Dato etiqueta="Litros" destacado>
            {conUnidad(carga.litros, 'L')}
            {carga.tanqueLleno && <span className="ml-1 text-xs font-normal text-tinta-suave">tanque lleno</span>}
          </Dato>
          <Dato etiqueta="Chofer">{carga.choferNombre ?? '—'}</Dato>
          <Dato etiqueta="Odómetro">{conUnidad(carga.odometroKm, 'km', 1)}</Dato>
          <Dato etiqueta="Precio unitario">
            {formatearNumero(carga.precioUnitario, 4)} {carga.moneda}
          </Dato>
          <Dato etiqueta="Importe">
            {formatearNumero(carga.importeOriginal)} {carga.moneda}
          </Dato>
          <Dato etiqueta="Medio de pago">{ETIQUETA_MEDIO_PAGO[carga.medioPago as MedioPago] ?? carga.medioPago}</Dato>
          {carga.motivoObservacion && (
            <Dato etiqueta="Observación">
              <span className="text-alerta">{carga.motivoObservacion}</span>
            </Dato>
          )}
          <Dato etiqueta="Ticket">{carga.tieneDocumento ? 'Cargado' : <span className="text-tinta-suave">Sin ticket</span>}</Dato>
          <Dato etiqueta="Registrada">{formatearFechaHora(carga.creadoEn, zonaHoraria)}</Dato>
          {carga.esFrontera && (
            <Dato etiqueta="Le faltaron para quedar lleno">
              {conUnidad(carga.faltanteLlenoL, 'L')}
              {carga.faltanteObservacion && <span className="block text-xs text-tinta-suave">{carga.faltanteObservacion}</span>}
            </Dato>
          )}
          {carga.anulaId && (
            <Dato etiqueta="Reemplaza a">
              <Link href={`/combustible/cargas/${carga.anulaId}`} className="text-marca hover:underline">
                Carga #{carga.anulaId}
              </Link>
            </Dato>
          )}
        </dl>
      </Seccion>

      {carga.destino === 'mochila_anterior' && (
        <p className="text-sm text-tinta-suave">
          Carga registrada a la mochila con el modelo anterior: cuenta como carga del camión, igual que las demás.
        </p>
      )}
      <TicketCarga carga={carga} />
      <Anulacion carga={carga} onRecargar={() => refetch()} />
    </div>
  );
}

/** Anulación con aprobación de otro usuario (C3a): pedir, aprobar, rechazar o retirar. */
function Anulacion({ carga, onRecargar }: { carga: Carga; onRecargar: () => void }) {
  const { usuarioId, zonaHoraria } = useSesion();
  const puedeEditar = useCan('combustible.cargas:editar');
  const puedeResolver = useCan('combustible.cargas:transicionar');
  const solicitar = useSolicitarAnulacion();
  const eliminar = useEliminarCarga();
  const router = useRouter();
  const [errorEliminar, setErrorEliminar] = useState<ErrorAccion | null>(null);
  const resolver = useResolverSolicitud();
  const retirar = useRetirarSolicitud();
  const [error, setError] = useState<ErrorAccion | null>(null);

  const ejecutar = async (p: Promise<{ ok: true } | { ok: false; error: ErrorAccion }>) => {
    setError(null);
    const r = await p;
    if (!r.ok) setError(r.error);
    return r.ok;
  };

  if (carga.situacion === 'anulada') {
    return (
      <Seccion titulo="Anulación">
        <p className="text-sm">
          <span className="font-medium text-error">Anulada.</span> {carga.motivoAnulacion}
        </p>
        {carga.sustituidaPor ? (
          <p className="text-sm">
            Reemplazada por la{' '}
            <Link href={`/combustible/cargas/${carga.sustituidaPor}`} className="text-marca hover:underline">
              carga #{carga.sustituidaPor}
            </Link>
            .
          </p>
        ) : (
          puedeEditar && (
            <Link href={`/combustible/cargas/nueva?camion=${carga.camionId}&reemplaza=${carga.id}`} className={BOTON_SECUNDARIO}>
              Registrar la carga que la reemplaza
            </Link>
          )
        )}
      </Seccion>
    );
  }

  if (carga.situacion === 'anulacion_pendiente' && carga.solicitud) {
    const s = carga.solicitud;
    return (
      <Seccion titulo="Anulación pendiente">
        <p className="text-sm">
          Pedida el {formatearFechaHora(s.creadoEn, zonaHoraria)}
          {s.creadoPor === usuarioId ? ' por vos' : ''}: <span className="italic">{s.motivo}</span>
        </p>
        <p className="text-xs text-tinta-suave">
          Mientras esté pendiente bloquea el cierre del viaje que contiene la carga. La aprueba otro usuario con rol aprobador.
        </p>
        <ErrorBase error={error} onRecargar={onRecargar} />
        <div className="flex flex-wrap gap-3">
          {puedeResolver && s.creadoPor !== usuarioId && (
            <>
              <AccionConMotivo
                etiqueta="Aprobar anulación"
                icono={<Check className="size-4" />}
                primario
                titulo="Aprobar la anulación"
                explicacion="La carga queda anulada y sus movimientos se revierten."
                pideMotivo={false}
                ocupado={resolver.isPending}
                error={null}
                onConfirmar={() => ejecutar(resolver.mutateAsync({ solicitudId: s.id, aprobar: true, motivo: '' }))}
              />
              <AccionConMotivo
                etiqueta="Rechazar"
                icono={<X className="size-4" />}
                titulo="Rechazar la anulación"
                ocupado={resolver.isPending}
                error={null}
                onConfirmar={(motivo) => ejecutar(resolver.mutateAsync({ solicitudId: s.id, aprobar: false, motivo }))}
              />
            </>
          )}
          {s.creadoPor === usuarioId && (
            <AccionConMotivo
              etiqueta="Retirar pedido"
              icono={<Undo2 className="size-4" />}
              titulo="Retirar el pedido de anulación"
              pideMotivo={false}
              ocupado={retirar.isPending}
              error={null}
              onConfirmar={() => ejecutar(retirar.mutateAsync({ solicitudId: s.id }))}
            />
          )}
        </div>
      </Seccion>
    );
  }

  if (!puedeEditar) return null;
  return (
    <Seccion titulo="Corregir">
      {(
        <AccionConMotivo
          etiqueta="Eliminar carga"
          icono={<Trash2 className="size-4" />}
          titulo="Eliminar la carga"
          explicacion="Para una carga cargada por error: desaparece del sistema junto con su ticket y sus movimientos (queda registrado en la auditoría). La elimina quien la cargó, o Administración de combustible o TI. No se puede si un cierre o el cálculo de consumo ya la usaron. Si solo hay que corregir un dato, usá «Editar»."
          ocupado={eliminar.isPending}
          error={errorEliminar}
          onRecargar={onRecargar}
          onConfirmar={async (motivo) => {
            setErrorEliminar(null);
            const r = await eliminar.mutateAsync({ cargaId: carga.id, motivo });
            if (!r.ok) {
              setErrorEliminar(r.error);
              return false;
            }
            router.push('/combustible/cargas');
            return true;
          }}
        />
      )}
      <AccionConMotivo
        etiqueta="Solicitar anulación"
        icono={<Ban className="size-4" />}
        titulo="Solicitar la anulación"
        explicacion="La anulación no se aplica todavía: la aprueba otro usuario con rol aprobador. Hasta entonces el cierre del viaje queda bloqueado."
        ocupado={solicitar.isPending}
        error={error}
        onRecargar={onRecargar}
        onConfirmar={(motivo) => ejecutar(solicitar.mutateAsync({ cargaId: carga.id, motivo }))}
      />
    </Seccion>
  );
}
