'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeftRight, Check, LoaderCircle, Plus, Undo2, X } from 'lucide-react';
import { Can, useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import type { ErrorAccion } from '@/server/actions/result';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { conSigno } from '@/shared/lib/numeros';
import { BOTON_PRIMARIO, CONTROL_FILTRO, TARJETA } from '@/shared/ui/clases';
import {
  ETIQUETA_CATEGORIA,
  ETIQUETA_ESTADO_APROBACION,
  ETIQUETA_TIPO_MOVIMIENTO,
  TAMANO_PAGINA_MOVIMIENTOS,
  TIPOS_MOVIMIENTO,
  parsearListaMovimientos,
  serializarListaMovimientos,
  type MovimientoCamion,
  type MovimientoListaParams,
  type TipoMovimiento,
} from '../../domain/movimiento.types';
import {
  useCamionesCombustible,
  useMovimientos,
  useResolverMovimiento,
  useResolverReversoMovimiento,
  useRetirarReversoMovimiento,
  useSolicitarReversoMovimiento,
} from '../../queries/hooks';
import { useFiltrosUrl } from '../comun/filtros';
import { AccionConMotivo, Cargando, Chip, Encabezado, ErrorBase, ErrorLectura, Paginador, Vacio, type Tono } from '../comun/ui';

const TONO_ESTADO = { pendiente: 'alerta', aprobado: 'exito', rechazado: 'error' } as const satisfies Record<string, Tono>;

/**
 * Combustible > Movimientos del camión (migración 26): descargas a base o a otro camión y
 * movimientos con motivo. La base decide quién aprueba y si el período está abierto.
 */
export function MovimientosLista() {
  const searchParams = useSearchParams();
  const { zonaHoraria } = useSesion();
  const params = useMemo(() => parsearListaMovimientos(new URLSearchParams(searchParams.toString())), [searchParams]);
  const { actualizar, limpiar, navegando } = useFiltrosUrl<MovimientoListaParams>(params, serializarListaMovimientos);
  const { data, isPending, isError, isFetching, refetch } = useMovimientos(params);
  const { data: camiones } = useCamionesCombustible();
  const hayFiltros = Boolean(params.camionId || params.tipo);

  return (
    <div className="space-y-5">
      <Encabezado titulo="Movimientos del camión">
        <Can permiso="combustible.movimientos:editar">
          <Link href={params.camionId ? `/combustible/movimientos/nuevo?camion=${params.camionId}` : '/combustible/movimientos/nuevo'} className={BOTON_PRIMARIO}>
            <Plus className="size-4" /> Registrar movimiento
          </Link>
        </Can>
      </Encabezado>
      <p className="text-sm text-tinta-suave">
        Combustible que entra o sale del camión sin ser una carga con ticket: descargas al tanque de base o a otro camión, derrames, robos,
        drenajes y cargas de bidón. Cuentan en el cierre del viaje.
      </p>

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
          aria-label="Tipo"
          className={CONTROL_FILTRO}
          value={params.tipo ?? ''}
          onChange={(e) => actualizar({ tipo: (e.target.value || undefined) as TipoMovimiento | undefined })}
        >
          <option value="">Todos los tipos</option>
          {TIPOS_MOVIMIENTO.map((t) => (
            <option key={t} value={t}>
              {ETIQUETA_TIPO_MOVIMIENTO[t]}
            </option>
          ))}
        </select>
        {hayFiltros && (
          <button type="button" onClick={limpiar} className="flex h-9 items-center gap-1 rounded-md px-2 text-sm text-marca hover:bg-marca-suave">
            <X className="size-4" /> Limpiar
          </button>
        )}
        {(navegando || (isFetching && !isPending)) && <LoaderCircle className="ml-auto size-4 animate-spin text-tinta-suave" aria-label="Actualizando" />}
      </section>

      <section className={cn(TARJETA, 'overflow-hidden')}>
        {isError ? (
          <ErrorLectura texto="No se pudieron cargar los movimientos." onReintentar={() => refetch()} />
        ) : isPending ? (
          <Cargando texto="Cargando movimientos…" />
        ) : data.filas.length === 0 ? (
          <Vacio icono={<ArrowLeftRight className="size-6" />} texto={hayFiltros ? 'Ningún movimiento coincide con los filtros.' : 'Todavía no hay movimientos del camión.'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="border-b border-borde bg-fondo text-left text-xs font-medium tracking-wide text-tinta-suave uppercase">
                <tr>
                  <th className="px-3 py-2.5">Fecha y hora</th>
                  <th className="px-3 py-2.5">Camión</th>
                  <th className="px-3 py-2.5">Tipo</th>
                  <th className="px-3 py-2.5 text-right">Litros</th>
                  <th className="px-3 py-2.5">Destino u origen</th>
                  <th className="px-3 py-2.5">Motivo</th>
                  <th className="px-3 py-2.5">Estado y acciones</th>
                </tr>
              </thead>
              <tbody className={cn('divide-y divide-borde align-top', isFetching && 'opacity-70')}>
                {data.filas.map((m) => (
                  <tr key={m.id}>
                    <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">{formatearFechaHora(m.fechaHora, zonaHoraria)}</td>
                    <td className="px-3 py-2.5 font-mono">{m.camionPatente ?? '—'}</td>
                    <td className="px-3 py-2.5">
                      {ETIQUETA_TIPO_MOVIMIENTO[m.tipo]}
                      {m.categoria && <span className="block text-xs text-tinta-suave">{ETIQUETA_CATEGORIA[m.categoria]}</span>}
                    </td>
                    <td className={cn('px-3 py-2.5 text-right font-medium tabular-nums', m.litros < 0 ? 'text-tinta' : 'text-exito')}>{conSigno(m.litros)} L</td>
                    <td className="px-3 py-2.5">
                      {m.depositoDestinoCodigo && <span className="font-mono">{m.depositoDestinoCodigo}</span>}
                      {m.camionContrapartePatente && <span className="font-mono">{m.camionContrapartePatente}</span>}
                      {!m.depositoDestinoCodigo && !m.camionContrapartePatente && <span className="text-tinta-suave">—</span>}
                      {m.choferNombre && <span className="block text-xs text-tinta-suave">{m.choferNombre}</span>}
                    </td>
                    <td className="max-w-64 px-3 py-2.5">
                      {m.motivo ?? <span className="text-tinta-suave">—</span>}
                      {m.evidencia && <span className="block text-xs text-tinta-suave">Evidencia: {m.evidencia}</span>}
                      {m.motivoResolucion && <span className="block text-xs text-tinta-suave">Resolución: {m.motivoResolucion}</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <EstadoYAcciones m={m} onRecargar={() => refetch()} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.filas.length > 0 && (
          <Paginador pagina={params.pagina} total={data.total ?? 0} tamano={TAMANO_PAGINA_MOVIMIENTOS} onCambiar={(p) => actualizar({ pagina: p }, true)} />
        )}
      </section>
    </div>
  );
}

function EstadoYAcciones({ m, onRecargar }: { m: MovimientoCamion; onRecargar: () => void }) {
  const { usuarioId } = useSesion();
  const puedeEditar = useCan('combustible.movimientos:editar');
  const puedeTransicionar = useCan('combustible.movimientos:transicionar');
  const resolver = useResolverMovimiento();
  const pedir = useSolicitarReversoMovimiento();
  const resolverReverso = useResolverReversoMovimiento();
  const retirar = useRetirarReversoMovimiento();
  const [error, setError] = useState<ErrorAccion | null>(null);

  const ejecutar = async (p: Promise<{ ok: true } | { ok: false; error: ErrorAccion }>) => {
    setError(null);
    const r = await p;
    if (!r.ok) setError(r.error);
    return r.ok;
  };

  return (
    <div className="flex min-w-56 flex-col items-start gap-2">
      <div className="flex flex-wrap gap-1">
        {m.estadoAprobacion && <Chip tono={TONO_ESTADO[m.estadoAprobacion]}>{ETIQUETA_ESTADO_APROBACION[m.estadoAprobacion]}</Chip>}
        {m.anulaId && <Chip tono="neutro">Reverso del #{m.anulaId}</Chip>}
        {m.revertido && <Chip tono="neutro">Revertido</Chip>}
        {m.solicitudPendienteId && <Chip tono="alerta">Reverso pedido</Chip>}
        {!m.estadoAprobacion && !m.anulaId && !m.revertido && !m.solicitudPendienteId && <Chip tono="exito">Registrado</Chip>}
      </div>
      <ErrorBase error={error} onRecargar={onRecargar} />

      {m.estadoAprobacion === 'pendiente' && puedeTransicionar && m.creadoPor !== usuarioId && (
        <div className="flex flex-wrap gap-2">
          <AccionConMotivo
            etiqueta="Aprobar"
            icono={<Check className="size-4" />}
            primario
            titulo="Aprobar el movimiento"
            explicacion="Pasa a contar en el cierre del viaje."
            pideMotivo={false}
            ocupado={resolver.isPending}
            error={null}
            onConfirmar={() => ejecutar(resolver.mutateAsync({ movimientoId: m.id, aprobar: true, motivo: '' }))}
          />
          <AccionConMotivo
            etiqueta="Rechazar"
            icono={<X className="size-4" />}
            titulo="Rechazar el movimiento"
            explicacion="No cuenta en el cierre del viaje."
            ocupado={resolver.isPending}
            error={null}
            onConfirmar={(motivo) => ejecutar(resolver.mutateAsync({ movimientoId: m.id, aprobar: false, motivo }))}
          />
        </div>
      )}

      {m.solicitudPendienteId && (
        <div className="flex flex-wrap gap-2">
          {puedeTransicionar && (
            <>
              <AccionConMotivo
                etiqueta="Aprobar reverso"
                icono={<Check className="size-4" />}
                titulo="Aprobar el reverso"
                explicacion="Se revierten todas las patas del movimiento (también la entrada al tanque de base)."
                pideMotivo={false}
                ocupado={resolverReverso.isPending}
                error={null}
                onConfirmar={() => ejecutar(resolverReverso.mutateAsync({ solicitudId: m.solicitudPendienteId!, aprobar: true, motivo: '' }))}
              />
              <AccionConMotivo
                etiqueta="Rechazar reverso"
                icono={<X className="size-4" />}
                titulo="Rechazar el reverso"
                ocupado={resolverReverso.isPending}
                error={null}
                onConfirmar={(motivo) => ejecutar(resolverReverso.mutateAsync({ solicitudId: m.solicitudPendienteId!, aprobar: false, motivo }))}
              />
            </>
          )}
          {puedeEditar && (
            <AccionConMotivo
              etiqueta="Retirar pedido"
              icono={<Undo2 className="size-4" />}
              titulo="Retirar el pedido de reverso"
              pideMotivo={false}
              ocupado={retirar.isPending}
              error={null}
              onConfirmar={() => ejecutar(retirar.mutateAsync({ solicitudId: m.solicitudPendienteId! }))}
            />
          )}
        </div>
      )}

      {puedeEditar && !m.anulaId && !m.revertido && !m.solicitudPendienteId && (m.estadoAprobacion === null || m.estadoAprobacion === 'aprobado') && (
        <AccionConMotivo
          etiqueta="Pedir reverso"
          icono={<Undo2 className="size-4" />}
          titulo="Pedir el reverso del movimiento"
          explicacion="No se aplica todavía: lo aprueba otro usuario con rol aprobador. Mientras tanto el cierre del viaje queda bloqueado."
          ocupado={pedir.isPending}
          error={null}
          onConfirmar={(motivo) => ejecutar(pedir.mutateAsync({ movimientoId: m.id, motivo }))}
        />
      )}
    </div>
  );
}
