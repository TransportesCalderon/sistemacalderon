'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Fuel, Plus } from 'lucide-react';
import { useGensets } from '@/modules/pizarra/queries/hooks';
import { Can } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora, hoyEnZona } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { BOTON_PRIMARIO, CONTROL_FILTRO, TARJETA } from '@/shared/ui/clases';
import { VERSION_GENSET_G1, VERSION_GENSET_G2, type CargaGenset } from '../../domain/genset.types';
import { useCargasGenset } from '../../queries/hooks';
import { Cargando, Chip, Encabezado, ErrorLectura, Vacio } from '../comun/ui';
import { TableroGensets } from './tablero-gensets';

const TH = 'px-3 py-2.5 whitespace-nowrap';
const TD = 'px-3 py-2.5 align-top';

/** Tractores | Gensets arriba de la lista de Cargas (migración 202). */
export function DestinoListaCargas({ actual }: { actual: 'tractor' | 'genset' }) {
  const op = [
    { id: 'tractor', etiqueta: 'Tractores', href: '/analisis/cargas' },
    { id: 'genset', etiqueta: 'Gensets', href: '/analisis/cargas?destino=genset' },
  ] as const;
  return (
    <nav aria-label="Destino de las cargas" className="inline-flex rounded-lg border border-borde bg-panel p-1">
      {op.map((o) => (
        <Link
          key={o.id}
          href={o.href}
          aria-current={actual === o.id ? 'page' : undefined}
          className={cn('rounded-md px-3 py-1.5 text-sm', actual === o.id ? 'bg-marca text-white' : 'text-tinta hover:bg-hover')}
        >
          {o.etiqueta}
        </Link>
      ))}
    </nav>
  );
}

const restarDias = (dia: string, n: number) => {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

/**
 * Migración 202 · Cargas › Gensets: cargas (desde estación o desde el surtidor de la base) y descargas de genset,
 * con semi, tractor, chofer, horómetro e importe. La base valida y calcula todo.
 */
export function CargasGensetLista() {
  const { zonaHoraria } = useSesion();
  const hay = useBaseTiene(VERSION_GENSET_G1);
  const hayG2 = useBaseTiene(VERSION_GENSET_G2);
  const [vista, setVista] = useState<'cargas' | 'tablero'>('cargas');
  const hoy = hoyEnZona(zonaHoraria);
  const [desde, setDesde] = useState<string>(restarDias(hoy, 30));
  const [hasta, setHasta] = useState<string>(hoy);
  const [gensetId, setGensetId] = useState<number | null>(null);
  const { data: gensets } = useGensets();
  const { data, isPending, isError, error, refetch, isFetching } = useCargasGenset(desde || null, hasta || null, gensetId, hay);
  const cargas = (data ?? []).filter((c) => c.tipo === 'carga');
  const litros = cargas.reduce((s, c) => s + c.litros, 0);

  return (
    <div className="space-y-5">
      <Encabezado titulo="Cargas">
        <Can permiso="combustible.cargas:editar">
          <Link href="/combustible/cargas/nueva?destino=genset" className={BOTON_PRIMARIO}>
            <Plus className="size-4" /> Nueva carga al genset
          </Link>
        </Can>
      </Encabezado>
      <div className="flex flex-wrap items-center gap-3">
        <DestinoListaCargas actual="genset" />
        {hayG2 && (
          <div role="tablist" aria-label="Vista" className="inline-flex rounded-lg border border-borde bg-panel p-1">
            {(
              [
                ['cargas', 'Cargas'],
                ['tablero', 'Tablero por genset'],
              ] as const
            ).map(([id, etiqueta]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={vista === id}
                onClick={() => setVista(id)}
                className={cn('rounded-md px-3 py-1.5 text-sm', vista === id ? 'bg-marca text-white' : 'text-tinta hover:bg-hover')}
              >
                {etiqueta}
              </button>
            ))}
          </div>
        )}
      </div>
      {hayG2 && vista === 'tablero' ? (
        <TableroGensets />
      ) : !hay ? (
        <Vacio icono={<Fuel className="size-6" />} texto="Falta aplicar en la base el cambio de los gensets (G1)." />
      ) : (
        <>
          <section className={cn(TARJETA, 'flex flex-wrap items-center gap-2 p-3')} aria-label="Filtros">
            <select aria-label="Genset" className={CONTROL_FILTRO} value={gensetId ?? ''} onChange={(e) => setGensetId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Todos los gensets</option>
              {[...(gensets ?? [])]
                .sort((a, b) => (a.semiPatente ?? a.codigo).localeCompare(b.semiPatente ?? b.codigo, 'es', { numeric: true }))
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.codigo}
                    {g.semiPatente ? ` · semi ${g.semiPatente}` : ''}
                  </option>
                ))}
            </select>
            <label className="flex items-center gap-1.5 text-sm text-tinta-suave">
              Desde
              <input type="date" className={CONTROL_FILTRO} value={desde} onChange={(e) => setDesde(e.target.value)} />
            </label>
            <label className="flex items-center gap-1.5 text-sm text-tinta-suave">
              hasta
              <input type="date" className={CONTROL_FILTRO} value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </label>
            {data && (
              <span className="ml-auto text-sm text-tinta-suave">
                {cargas.length} carga(s) · {formatearNumero(litros, 0)} L
              </span>
            )}
          </section>

          {isPending ? (
            <Cargando texto="Leyendo las cargas de genset…" />
          ) : isError ? (
            <ErrorLectura texto="No se pudieron leer las cargas de genset." error={error} onReintentar={() => void refetch()} />
          ) : data.length === 0 ? (
            <Vacio icono={<Fuel className="size-6" />} texto="No hay cargas de genset en ese período." />
          ) : (
            <div className={cn(TARJETA, 'overflow-x-auto', isFetching && 'opacity-80')}>
              <table className="w-full min-w-[1100px] text-sm">
                <thead className="border-b border-borde bg-fondo text-left text-xs font-medium tracking-wide text-tinta-suave uppercase">
                  <tr>
                    <th className={TH}>Fecha</th>
                    <th className={TH}>Genset</th>
                    <th className={TH}>Semi / tractor</th>
                    <th className={TH}>Chofer</th>
                    <th className={TH}>Origen</th>
                    <th className={cn(TH, 'text-right')}>Litros</th>
                    <th className={cn(TH, 'text-right')}>Horómetro</th>
                    <th className={cn(TH, 'text-right')}>Importe</th>
                    <th className={TH}>Vuelta</th>
                    {hayG2 && <th className={TH}>Viaje / operación</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-borde">
                  {data.map((c) => (
                    <Fila key={c.id} c={c} zona={zonaHoraria} conImputacion={hayG2} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Fila({ c, zona, conImputacion }: { c: CargaGenset; zona: string; conImputacion: boolean }) {
  const origen =
    c.origen === 'descarga_base' ? `Descarga a ${c.tanque ?? 'la base'}` : c.origen === 'tanque_base' ? `Surtidor de la base (${c.estacion ?? ''})` : (c.estacion ?? '—');
  return (
    <tr>
      <td className={cn(TD, 'whitespace-nowrap tabular-nums')}>{formatearFechaHora(c.fechaHora, zona)}</td>
      <td className={TD}>
        <Link href={`/flota/gensets/${c.gensetId}`} className="font-mono font-semibold text-marca hover:underline">
          {c.genset}
        </Link>
        {c.tipo === 'descarga' ? (
          <span className="ml-1">
            <Chip tono="neutro">Descarga</Chip>
          </span>
        ) : (
          c.tanqueLleno && (
            <span className="ml-1">
              <Chip tono="marca">Lleno</Chip>
            </span>
          )
        )}
      </td>
      <td className={TD}>
        <span className="font-mono">{c.semi ?? '—'}</span>
        {c.tractor && <span className="block text-xs text-tinta-suave">con {c.tractor}</span>}
      </td>
      <td className={TD}>{c.chofer ?? '—'}</td>
      <td className={TD}>
        {origen}
        {c.ticketNumero && <span className="block text-xs text-tinta-suave">Ticket {c.ticketNumero}</span>}
      </td>
      <td className={cn(TD, 'text-right tabular-nums')}>{formatearNumero(c.litros, 1)}</td>
      <td className={cn(TD, 'text-right tabular-nums')}>{formatearNumero(c.horometroH, 1)} h</td>
      <td className={cn(TD, 'text-right tabular-nums')}>{c.importe === null ? '—' : `${c.moneda ?? ''} ${formatearNumero(c.importe, 0)}`}</td>
      <td className={TD}>{c.cierre ? <Chip tono="exito">Cerrada {c.cierre}</Chip> : <span className="text-xs text-tinta-suave">abierta</span>}</td>
      {conImputacion && (
        <td className={TD}>
          {c.tipo === 'descarga' || !c.imputacion ? (
            <span className="text-tinta-suave">—</span>
          ) : c.imputacion.viaje ? (
            <>
              <span className="font-mono">{c.imputacion.viaje}</span>
              {c.imputacion.operacion && <span className="block text-xs text-tinta-suave">Op. {c.imputacion.operacion}</span>}
              {c.imputacion.estimado && <span className="block text-xs text-alerta">valor estimado</span>}
            </>
          ) : (
            <span className="text-xs text-alerta">{c.imputacion.motivo ?? 'Sin imputar'}</span>
          )}
        </td>
      )}
    </tr>
  );
}
