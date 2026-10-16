'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CircleStop, Play, Rocket } from 'lucide-react';
import { Can, useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { conUnidad, formatearNumero } from '@/shared/lib/numeros';
import type { DepositoId } from '@/shared/types/dominio';
import type { Mochila } from '../../domain/mochila.types';
import { useCamionesMochila, useCerrarUso, useCerrarVigencia, useHistorialMochilas, useRegistrarUso, useUsosMochila } from '../../queries/hooks';
import { Cargando, Chip, ErrorLectura, Seccion } from '../comun/ui';
import { ControlesMochila } from './controles-mochila';
import { PuestaEnMarchaForm } from './puesta-en-marcha-form';
import { AccionConParada } from './selector-parada';

/**
 * Mochilas y controles de un camión: uso de mochila, historial de vigencias, puesta en
 * marcha (TI) y controles de saldo. Las superposiciones de vigencias las rechaza la base.
 */
export function MochilaCamion({ camionId }: { camionId: number }) {
  const { data: camiones } = useCamionesMochila();
  const camion = camiones?.find((c) => c.camionId === camionId);
  const historial = useHistorialMochilas(camionId);
  const vigente = useMemo(() => historial.data?.find((m) => m.vigenteHasta === null) ?? null, [historial.data]);
  const [elegida, setElegida] = useState<DepositoId | null>(null);
  const mochilaControles = historial.data?.find((m) => m.id === elegida) ?? vigente ?? historial.data?.[0] ?? null;

  return (
    <div className="space-y-5">
      <Link href="/combustible/mochilas" className="inline-flex items-center gap-1 text-sm text-tinta-suave hover:text-tinta">
        <ArrowLeft className="size-4" /> Mochilas y controles
      </Link>
      <header>
        <p className="text-sm text-tinta-suave">Mochilas y controles</p>
        <h1 className="text-2xl font-semibold text-tinta">
          {camion ? (
            <>
              {camion.codigoInterno} · <span className="font-mono">{camion.patente}</span>
            </>
          ) : (
            `Camión #${camionId}`
          )}
        </h1>
      </header>

      <UsosMochila camionId={camionId} />

      <Seccion titulo="Mochilas (vigencias)">
        {historial.isError ? (
          <ErrorLectura texto="No se pudo cargar el historial de mochilas." onReintentar={() => historial.refetch()} />
        ) : historial.isPending ? (
          <Cargando texto="Cargando mochilas…" />
        ) : historial.data.length === 0 ? (
          <p className="text-sm text-tinta-suave">El camión todavía no tiene mochilas.</p>
        ) : (
          <TablaMochilas mochilas={historial.data} elegida={mochilaControles?.id ?? null} onElegir={setElegida} camionId={camionId} />
        )}
        {!historial.isPending && !vigente && (
          <Can permiso="combustible.depositos:transicionar">
            <PuestaEnMarchaForm camionId={camionId} />
          </Can>
        )}
        {!historial.isPending && !vigente && !historial.isError && <SoloTi />}
      </Seccion>

      {mochilaControles && <ControlesMochila camionId={camionId} mochila={mochilaControles} />}
    </div>
  );
}

function SoloTi() {
  const puede = useCan('combustible.depositos:transicionar');
  if (puede) return null;
  return <p className="text-sm text-tinta-suave">La puesta en marcha de una mochila la hace TI.</p>;
}

function UsosMochila({ camionId }: { camionId: number }) {
  const { zonaHoraria } = useSesion();
  const { data, isPending, isError, refetch } = useUsosMochila(camionId);
  const registrar = useRegistrarUso();
  const cerrar = useCerrarUso();
  const abierto = data?.find((u) => u.hastaTs === null) ?? null;

  return (
    <Seccion titulo="Uso de mochila">
      {isError ? (
        <ErrorLectura texto="No se pudo cargar el uso de mochila." onReintentar={() => refetch()} />
      ) : isPending ? (
        <Cargando texto="Cargando…" />
      ) : data.length === 0 ? (
        <p className="text-sm text-tinta-suave">Sin períodos de uso.</p>
      ) : (
        <ul className="divide-y divide-borde text-sm">
          {data.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-2 py-2">
              {u.hastaTs === null ? <Chip tono="exito">Vigente</Chip> : <Chip tono="neutro">Cerrado</Chip>}
              <span>
                Desde{' '}
                <Link href={`/combustible/cargas/${u.paradaDesdeId}`} className="text-marca hover:underline">
                  #{u.paradaDesdeId}
                </Link>{' '}
                ({formatearFechaHora(u.desdeTs, zonaHoraria)})
              </span>
              {u.paradaHastaId && (
                <span>
                  hasta{' '}
                  <Link href={`/combustible/cargas/${u.paradaHastaId}`} className="text-marca hover:underline">
                    #{u.paradaHastaId}
                  </Link>{' '}
                  ({formatearFechaHora(u.hastaTs, zonaHoraria)})
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <Can permiso="combustible.depositos:editar">
        {!isPending &&
          !isError &&
          (abierto ? (
            <AccionConParada
              camionId={camionId}
              etiqueta="Cerrar uso"
              icono={<CircleStop className="size-4" />}
              titulo="Cerrar el uso de mochila"
              explicacion="El uso termina en el corte de viaje que elijas."
              ocupado={cerrar.isPending}
              onConfirmar={async (paradaHastaId) => {
                const r = await cerrar.mutateAsync({ usoId: abierto.id, versionFila: abierto.versionFila, paradaHastaId });
                return r.ok ? null : r.error;
              }}
            />
          ) : (
            <AccionConParada
              camionId={camionId}
              etiqueta="Registrar uso"
              icono={<Play className="size-4" />}
              titulo="Registrar uso de mochila"
              explicacion="El camión usa mochila a partir del corte de viaje que elijas."
              ocupado={registrar.isPending}
              onConfirmar={async (paradaDesdeId) => {
                const r = await registrar.mutateAsync({ camionId, paradaDesdeId });
                return r.ok ? null : r.error;
              }}
            />
          ))}
      </Can>
    </Seccion>
  );
}

function TablaMochilas({
  mochilas,
  elegida,
  onElegir,
  camionId,
}: {
  mochilas: Mochila[];
  elegida: DepositoId | null;
  onElegir: (id: DepositoId) => void;
  camionId: number;
}) {
  const { zonaHoraria } = useSesion();
  const cerrar = useCerrarVigencia();
  const vigente = mochilas.find((m) => m.vigenteHasta === null);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="border-b border-borde text-left text-xs font-medium tracking-wide text-tinta-suave uppercase">
            <tr>
              <th className="px-2 py-2">Código</th>
              <th className="px-2 py-2">Nombre</th>
              <th className="px-2 py-2 text-right">Capacidad</th>
              <th className="px-2 py-2">Vigente desde</th>
              <th className="px-2 py-2">Vigente hasta</th>
              <th className="px-2 py-2 text-right">Saldo de libro</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {mochilas.map((m) => (
              <tr key={m.id} className={cn(m.id === elegida && 'bg-marca-suave/40')}>
                <td className="px-2 py-2 font-mono">{m.codigo}</td>
                <td className="px-2 py-2">{m.nombre}</td>
                <td className="px-2 py-2 text-right tabular-nums">{formatearNumero(m.capacidadL, 0)} L</td>
                <td className="px-2 py-2 whitespace-nowrap">
                  {formatearFechaHora(m.vigenteDesde, zonaHoraria)}
                  {m.paradaDesdeId && <span className="ml-1 text-xs text-tinta-suave">#{m.paradaDesdeId}</span>}
                </td>
                <td className="px-2 py-2 whitespace-nowrap">
                  {m.vigenteHasta ? (
                    <>
                      {formatearFechaHora(m.vigenteHasta, zonaHoraria)}
                      {m.paradaHastaId && <span className="ml-1 text-xs text-tinta-suave">#{m.paradaHastaId}</span>}
                    </>
                  ) : (
                    <Chip tono="exito">Vigente</Chip>
                  )}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{conUnidad(m.saldoL, 'L')}</td>
                <td className="px-2 py-2 text-right">
                  {m.id !== elegida && (
                    <button type="button" className="text-marca hover:underline" onClick={() => onElegir(m.id)}>
                      Ver controles
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {vigente && (
        <Can permiso="combustible.depositos:transicionar">
          <AccionConParada
            camionId={camionId}
            etiqueta="Cerrar vigencia"
            icono={<Rocket className="size-4 rotate-180" />}
            titulo={`Cerrar la vigencia de ${vigente.codigo}`}
            explicacion="La mochila deja de estar vigente en el corte de viaje que elijas (la base fija la hora)."
            ocupado={cerrar.isPending}
            onConfirmar={async (paradaHastaId) => {
              const r = await cerrar.mutateAsync({ depositoId: vigente.id, versionFila: vigente.versionFila, paradaHastaId });
              return r.ok ? null : r.error;
            }}
          />
        </Can>
      )}
    </div>
  );
}
