'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { BadgeCheck, FileUp, Inbox } from 'lucide-react';
import { TD, TH } from '@/modules/catalogos/components/comun';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import type { ErrorAccion } from '@/server/actions/result';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import type { Bandeja } from '../../domain/documento.types';
import { TAMANO_PAGINA_BANDEJA, type CargaEnBandeja } from '../../repositories/documento.repository';
import { useBandeja, useValidarCarga } from '../../queries/hooks';
import { AccionConMotivo, Cargando, Chip, Encabezado, ErrorBase, ErrorLectura, Paginador, Vacio } from '../comun/ui';
import { AdjuntarTicket } from './ticket-carga';

const TITULO: Record<Bandeja, { titulo: string; vacio: string }> = {
  por_validar: { titulo: 'Cargas por validar', vacio: 'No hay cargas pendientes de validar.' },
  observadas: { titulo: 'Cargas por validar', vacio: 'No hay cargas observadas.' },
  sin_documento: { titulo: 'Cargas sin ticket', vacio: 'Todas las cargas tienen su ticket adjunto.' },
};

/**
 * Bandejas de cargas (migración 34): por validar (pendientes y observadas), solo observadas y
 * sin ticket. Las más antiguas primero. Validar y adjuntar se hacen desde la misma fila.
 */
export function BandejaCargas({ tipo }: { tipo: Bandeja }) {
  const { zonaHoraria } = useSesion();
  const [pagina, setPagina] = useState(1);
  const [abierta, setAbierta] = useState<number | null>(null);
  const { data, isPending, isError, isFetching, refetch } = useBandeja(tipo, pagina);
  const t = TITULO[tipo];

  return (
    <div className="space-y-5">
      <Encabezado titulo={t.titulo} />
      {tipo !== 'sin_documento' && (
        <nav className="flex gap-2 text-sm" aria-label="Filtro">
          <Link
            href="/combustible/observadas"
            className={cn(
              'rounded-full border px-3 py-1',
              tipo === 'por_validar' ? 'border-marca bg-marca-suave text-marca' : 'border-borde text-tinta-suave',
            )}
          >
            Todas por validar
          </Link>
          <Link
            href="/combustible/observadas?estado=observada"
            className={cn(
              'rounded-full border px-3 py-1',
              tipo === 'observadas' ? 'border-marca bg-marca-suave text-marca' : 'border-borde text-tinta-suave',
            )}
          >
            Solo observadas
          </Link>
        </nav>
      )}
      <p className="text-sm text-tinta-suave">
        {tipo === 'sin_documento'
          ? 'Adjuntá la foto o el PDF del ticket. Sin ticket la carga no se puede validar.'
          : 'Revisá cada carga contra su ticket. La valida otro usuario con rol aprobador, no quien la registró; una observada necesita el motivo.'}
      </p>

      <section className="overflow-hidden rounded-xl border border-borde bg-panel">
        {isPending ? (
          <Cargando texto="Cargando la bandeja…" />
        ) : isError ? (
          <ErrorLectura texto="No se pudo cargar la bandeja." onReintentar={() => refetch()} />
        ) : data.filas.length === 0 ? (
          <Vacio icono={<Inbox className="size-6" />} texto={t.vacio} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="border-b border-borde bg-fondo">
                  <tr>
                    <th className={TH}>Carga</th>
                    <th className={TH}>Fecha y hora</th>
                    <th className={TH}>Camión</th>
                    <th className={TH}>Estación</th>
                    <th className={cn(TH, 'text-right')}>Litros</th>
                    <th className={cn(TH, 'text-right')}>Importe</th>
                    <th className={TH}>Estado</th>
                    <th className={TH} />
                  </tr>
                </thead>
                <tbody className={cn('divide-y divide-borde', isFetching && 'opacity-70')}>
                  {data.filas.map((c) => (
                    <Fragment key={c.id}>
                      <tr>
                        <td className={TD}>
                          <Link href={`/combustible/cargas/${c.id}`} className="font-medium text-marca hover:underline">
                            #{c.id}
                          </Link>
                        </td>
                        <td className={cn(TD, 'whitespace-nowrap tabular-nums')}>{formatearFechaHora(c.fechaHora, zonaHoraria)}</td>
                        <td className={cn(TD, 'font-mono')}>{c.camionPatente ?? '—'}</td>
                        <td className={TD}>{c.estacion ?? '—'}</td>
                        <td className={cn(TD, 'text-right tabular-nums')}>{formatearNumero(c.litros)}</td>
                        <td className={cn(TD, 'text-right tabular-nums whitespace-nowrap')}>
                          {formatearNumero(c.importe)} {c.moneda}
                        </td>
                        <td className={TD}>
                          <div className="flex flex-wrap gap-1">
                            {c.estadoValidacion === 'observada' ? (
                              <Chip tono="alerta">Observada</Chip>
                            ) : (
                              <Chip tono="neutro">Pendiente</Chip>
                            )}
                            {!c.tieneDocumento && <Chip tono="error">Sin ticket</Chip>}
                          </div>
                          {c.motivoObservacion && <span className="mt-1 block max-w-72 text-xs text-alerta">{c.motivoObservacion}</span>}
                        </td>
                        <td className={cn(TD, 'text-right')}>
                          <Acciones c={c} abierta={abierta === c.id} onAlternar={() => setAbierta(abierta === c.id ? null : c.id)} />
                        </td>
                      </tr>
                      {abierta === c.id && (
                        <tr>
                          <td colSpan={8} className="bg-fondo/40 px-3 py-3">
                            <AdjuntarTicket
                              carga={{
                                id: c.id,
                                estacionId: c.estacionId,
                                fechaHora: c.fechaHora,
                                estadoValidacion: c.estadoValidacion,
                                motivoObservacion: c.motivoObservacion,
                              }}
                              onListo={() => setAbierta(null)}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <Paginador pagina={pagina} total={data.total ?? 0} tamano={TAMANO_PAGINA_BANDEJA} onCambiar={setPagina} />
          </>
        )}
      </section>
    </div>
  );
}

function Acciones({ c, abierta, onAlternar }: { c: CargaEnBandeja; abierta: boolean; onAlternar: () => void }) {
  const { usuarioId } = useSesion();
  const puedeAdjuntar = useCan('combustible.documentos:editar');
  const puedeValidar = useCan('combustible.cargas:transicionar');
  const validar = useValidarCarga();
  const [error, setError] = useState<ErrorAccion | null>(null);
  const observada = c.estadoValidacion === 'observada';

  return (
    <div className="flex min-w-44 flex-col items-end gap-2">
      {!c.tieneDocumento && puedeAdjuntar && (
        <button type="button" className="inline-flex items-center gap-1 text-xs text-marca hover:underline" onClick={onAlternar}>
          <FileUp className="size-3.5" /> {abierta ? 'Cerrar' : 'Adjuntar ticket'}
        </button>
      )}
      {c.tieneDocumento && puedeValidar && c.creadoPor !== usuarioId && (
        <AccionConMotivo
          etiqueta="Validar"
          icono={<BadgeCheck className="size-4" />}
          titulo={`Validar la carga #${c.id}`}
          {...(c.motivoObservacion ? { explicacion: `Observación: ${c.motivoObservacion}` } : {})}
          motivoOpcional={!observada}
          ocupado={validar.isPending}
          error={error}
          onConfirmar={async (motivo) => {
            setError(null);
            const r = await validar.mutateAsync({ cargaId: c.id, motivo });
            if (!r.ok) setError(r.error);
            return r.ok;
          }}
        />
      )}
      {c.tieneDocumento && c.creadoPor === usuarioId && <span className="text-xs text-tinta-suave">La valida otro usuario</span>}
      <ErrorBase error={error} />
    </div>
  );
}
