'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, Plus } from 'lucide-react';
import { useEnvio } from '@/modules/catalogos/components/comun';
import { Cargando, Encabezado, ErrorBase, ErrorLectura } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import { cn } from '@/shared/lib/cn';
import { formatearFechaDia } from '@/shared/lib/fechas';
import { BOTON_PRIMARIO, TARJETA } from '@/shared/ui/clases';
import { ETAPAS, ETIQUETA_ACTIVIDAD, ETIQUETA_ETAPA, usd, type Etapa, type NegocioTablero } from '../domain/ventas.types';
import { useCompletarActividad, useMoverNegocio, useTablero } from '../queries/hooks';

/** Ventas › Tablero: números del mes, lo que hay que hacer y los negocios por etapa. */
export function TableroVentas() {
  const { data, isLoading, isError, refetch } = useTablero();
  const puede = useCan('ventas.empresas:editar');
  const puedeCotizar = useCan('ventas.cotizaciones:editar');
  const completar = useCompletarActividad();
  const envio = useEnvio();

  if (isLoading) return <Cargando texto="Armando el tablero…" />;
  if (isError || !data) return <ErrorLectura texto="No se pudo leer el tablero." onReintentar={() => void refetch()} />;
  const c = data.cotizacionesMes;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Encabezado titulo="Tablero de ventas" subtitulo="Ventas" />
        {puedeCotizar && (
          <Link href="/ventas/cotizaciones/nueva" className={BOTON_PRIMARIO}>
            <Plus className="size-4" /> Nueva cotización
          </Link>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Dato titulo="Cotizaciones del mes" valor={String(c.hechas)} detalle={`${c.aceptadas} aceptadas · ${c.rechazadas} rechazadas`} href="/ventas/cotizaciones" />
        <Dato titulo="Esperando respuesta" valor={String(data.porResponder)} detalle="cotizaciones enviadas" href="/ventas/cotizaciones" />
        <Dato titulo="Aceptado en el mes" valor={usd(c.aceptadoUsd)} detalle="total de las aceptadas" />
        <Dato titulo="Facturado en el mes" valor={usd(data.facturadoMesUsd)} detalle={`${data.porFacturar} operación(es) por facturar`} href="/ventas/facturacion" />
        <Dato
          titulo="Por cobrar"
          valor={usd(data.porCobrarUsd)}
          detalle={data.vencidoUsd > 0 ? `${usd(data.vencidoUsd)} vencido` : 'nada vencido'}
          alerta={data.vencidoUsd > 0}
          href="/ventas/facturacion"
        />
      </div>

      <section className={cn(TARJETA, 'space-y-2 p-4')}>
        <h2 className="font-semibold text-tinta">Para hacer (hasta 7 días)</h2>
        <ErrorBase error={envio.error} />
        {data.actividades.length === 0 ? (
          <p className="text-sm text-tinta-suave">No hay llamadas ni tareas pendientes.</p>
        ) : (
          <ul className="divide-y divide-borde text-sm">
            {data.actividades.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className={cn('w-24 tabular-nums', a.atrasada ? 'font-medium text-error' : 'text-tinta-suave')}>{formatearFechaDia(a.fecha)}</span>
                <span className="w-20 text-xs text-tinta-suave uppercase">{ETIQUETA_ACTIVIDAD[a.tipo]}</span>
                <span className="flex-1">
                  {a.titulo} ·{' '}
                  <Link href={`/ventas/empresas/${a.empresaId}`} className="text-marca hover:underline">
                    {a.empresa}
                  </Link>
                  {!a.mia && a.responsable && <span className="text-tinta-suave"> · {a.responsable}</span>}
                </span>
                {puede && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-marca hover:underline"
                    disabled={completar.isPending}
                    onClick={() => void envio.enviar(completar.mutateAsync({ id: a.id, resultado: null }), () => undefined)}
                  >
                    <Check className="size-4" /> Hecha
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-tinta">Negocios por etapa</h2>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {ETAPAS.map((e) => (
            <Columna key={e} etapa={e} negocios={data.negocios.filter((n) => n.etapa === e)} puede={puede} />
          ))}
        </div>
      </section>
    </div>
  );
}

function Dato({ titulo, valor, detalle, href, alerta = false }: { titulo: string; valor: string; detalle: string; href?: string; alerta?: boolean }) {
  const cuerpo = (
    <div className={cn(TARJETA, 'h-full space-y-1 p-4', href && 'hover:border-marca')}>
      <p className="text-xs text-tinta-suave uppercase">{titulo}</p>
      <p className="text-2xl font-semibold tabular-nums text-tinta">{valor}</p>
      <p className={cn('text-xs', alerta ? 'font-medium text-error' : 'text-tinta-suave')}>{detalle}</p>
    </div>
  );
  return href ? <Link href={href}>{cuerpo}</Link> : cuerpo;
}

function Columna({ etapa, negocios, puede }: { etapa: Etapa; negocios: NegocioTablero[]; puede: boolean }) {
  const total = negocios.reduce((t, n) => t + (n.valorMensualUsd ?? 0), 0);
  return (
    <div className="w-60 shrink-0 space-y-2 rounded-lg bg-fondo/60 p-2">
      <div className="px-1">
        <p className="text-sm font-semibold text-tinta">
          {ETIQUETA_ETAPA[etapa]} <span className="text-tinta-suave">({negocios.length})</span>
        </p>
        <p className="text-xs text-tinta-suave">{total > 0 ? `${usd(total)} por mes` : '\u00a0'}</p>
      </div>
      {negocios.map((n) => (
        <TarjetaNegocio key={n.id} n={n} puede={puede} />
      ))}
    </div>
  );
}

function TarjetaNegocio({ n, puede }: { n: NegocioTablero; puede: boolean }) {
  const mover = useMoverNegocio();
  const envio = useEnvio();
  const [motivo, setMotivo] = useState<string | null>(null);
  return (
    <div className={cn(TARJETA, 'space-y-1 p-3 text-sm')}>
      <Link href={`/ventas/empresas/${n.empresaId}`} className="font-medium text-tinta hover:text-marca">
        {n.empresa}
      </Link>
      <p className="text-tinta-suave">{n.titulo}</p>
      <p className="text-xs text-tinta-suave">
        {n.valorMensualUsd ? `${usd(n.valorMensualUsd)}/mes` : ''}
        {n.cierreEstimado && ` · cierre ${formatearFechaDia(n.cierreEstimado)}`}
      </p>
      {puede && (
        <select
          aria-label="Mover a otra etapa"
          className="h-8 w-full rounded-md border border-borde bg-panel px-2 text-xs"
          value={n.etapa}
          disabled={mover.isPending}
          onChange={(e) => {
            const etapa = e.target.value as Etapa;
            if (etapa === 'perdido') return setMotivo('');
            void envio.enviar(mover.mutateAsync({ id: n.id, etapa, motivo: null }), () => undefined);
          }}
        >
          {ETAPAS.map((e) => (
            <option key={e} value={e}>
              {ETIQUETA_ETAPA[e]}
            </option>
          ))}
        </select>
      )}
      {motivo !== null && (
        <div className="space-y-1">
          <input
            className="h-8 w-full rounded-md border border-borde bg-panel px-2 text-xs"
            placeholder="¿Por qué se perdió?"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              className="text-error hover:underline"
              onClick={() => void envio.enviar(mover.mutateAsync({ id: n.id, etapa: 'perdido', motivo }), () => setMotivo(null))}
            >
              Marcar perdido
            </button>
            <button type="button" className="text-tinta-suave hover:underline" onClick={() => setMotivo(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      <ErrorBase error={envio.error} />
    </div>
  );
}
