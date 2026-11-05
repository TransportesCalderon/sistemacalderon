'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Equal, Fuel, MapPin } from 'lucide-react';
import { TD, TH } from '@/modules/catalogos/components/comun';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { NombreEnlazado } from '@/shared/ui/nombre-enlazado';
import {
  ETIQUETA_INCIDENTE,
  haceCuanto,
  PERIODOS_ESTACION,
  type DiasEstacion,
  type EstacionPatron,
  type IncidenteCarga,
} from '../../domain/estaciones.types';
import { useDetalleEstacion, usePatronesEstaciones } from '../../queries/hooks';
import { Cargando, Chip, ErrorLectura, Vacio } from '../comun/ui';
import { Cifra } from './periodo';

const num = (v: number | null, d = 1) => (v === null ? '—' : formatearNumero(v, d));

type Orden = 'posicion' | 'cargas' | 'litros' | 'faltante' | 'pct' | 'imposibles' | 'indice' | 'ultimo';
const COLUMNAS: { id: Orden; texto: string; titulo?: string }[] = [
  { id: 'cargas', texto: 'Cargas' },
  { id: 'litros', texto: 'Litros' },
  { id: 'faltante', texto: 'Faltante asociado', titulo: 'Faltante de los viajes repartido por los litros que cargó la estación' },
  { id: 'indice', texto: 'Cada 1.000 L / índice', titulo: 'Litros faltantes asociados cada 1.000 L cargados; índice 1,0 = promedio de la flota' },
  { id: 'imposibles', texto: 'Cargas imposibles' },
  { id: 'pct', texto: '% con incidente' },
  { id: 'ultimo', texto: 'Último incidente' },
];
const valorOrden = (e: EstacionPatron, o: Orden): number => {
  switch (o) {
    case 'posicion':
      return -(e.posicion ?? 1e9);
    case 'cargas':
      return e.cargas;
    case 'litros':
      return e.litros;
    case 'faltante':
      return e.faltanteAsociadoL ?? -1;
    case 'pct':
      return e.pctIncidentes ?? -1;
    case 'imposibles':
      return e.cargasImposibles ?? -1;
    case 'indice':
      return e.faltantePorMilL ?? -1;
    case 'ultimo':
      return e.ultimoIncidente ? new Date(e.ultimoIncidente).getTime() : 0;
  }
};

/**
 * Migración 191 · Fase 3: patrones por estación. Ranking de anomalías para interpretar (no clasifica
 * ninguna estación). Los litros son ASOCIADOS: el faltante de cada viaje repartido por los litros que
 * cargó cada estación. Lo calcula la base; con pocas cargas no se muestran indicadores.
 */
export function PatronesEstaciones() {
  const [dias, setDias] = useState<DiasEstacion>(90);
  const [orden, setOrden] = useState<Orden>('posicion');
  const [abierta, setAbierta] = useState<number | null>(null);
  const { data, isPending, isError, error, refetch, isFetching } = usePatronesEstaciones(dias, true);

  const lista = data
    ? [...data.estaciones].sort((a, b) => (a.suficiente === b.suficiente ? valorOrden(b, orden) - valorOrden(a, orden) : a.suficiente ? -1 : 1))
    : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg border border-borde bg-panel p-1" role="group" aria-label="Período">
          {PERIODOS_ESTACION.map((p) => (
            <button
              key={p.dias}
              type="button"
              aria-pressed={dias === p.dias}
              onClick={() => setDias(p.dias)}
              className={cn('rounded-md px-3 py-1.5 text-sm', dias === p.dias ? 'bg-marca text-white' : 'text-tinta-suave hover:text-tinta')}
            >
              {p.texto}
            </button>
          ))}
        </div>
      </div>
      <p className="max-w-3xl text-sm text-tinta-suave">
        Esto no acusa a ninguna estación: muestra patrones para interpretar. El faltante de un viaje se reparte entre las estaciones según los litros que
        cargó cada una, por eso se habla de litros <strong>asociados</strong> y no causados. Las alertas descartadas no cuentan.
      </p>

      {isPending ? (
        <Cargando texto="Calculando los patrones…" />
      ) : isError ? (
        <ErrorLectura texto={error instanceof Error ? error.message : 'No se pudo calcular.'} onReintentar={() => refetch()} />
      ) : data.estaciones.length === 0 ? (
        <Vacio icono={<Fuel className="size-6" />} texto="No hay cargas en estaciones en el período." />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Cifra etiqueta="Cargas de la flota" valor={formatearNumero(data.flota.cargas, 0)} detalle={`${formatearNumero(data.flota.litros, 0)} L`} />
            <Cifra etiqueta="Faltante asociado" valor={`${formatearNumero(data.flota.faltanteAsociadoL, 0)} L`} />
            <Cifra etiqueta="Promedio de la flota" valor={`${num(data.flota.faltantePorMilL, 2)} L`} detalle="faltantes cada 1.000 L cargados (índice 1,0)" />
            <Cifra etiqueta="Cargas con incidente" valor={data.flota.pctIncidentes === null ? '—' : `${formatearNumero(data.flota.pctIncidentes, 1)} %`} />
          </div>
          <section className="overflow-hidden rounded-xl border border-borde bg-panel">
            <div className="overflow-x-auto">
              <table className={cn('w-full min-w-[1100px] text-sm', isFetching && 'opacity-70')}>
                <thead className="border-b border-borde bg-fondo">
                  <tr>
                    <th className={TH}>
                      <BotonOrden activo={orden === 'posicion'} onClick={() => setOrden('posicion')}>
                        #
                      </BotonOrden>
                    </th>
                    <th className={TH}>Estación</th>
                    {COLUMNAS.map((c) => (
                      <th key={c.id} className={cn(TH, 'text-right')} title={c.titulo}>
                        <BotonOrden activo={orden === c.id} onClick={() => setOrden(c.id)}>
                          {c.texto}
                        </BotonOrden>
                      </th>
                    ))}
                    <th className={TH} title="Litros faltantes cada 1.000 L: últimos 30 días contra últimos 90 días">
                      30 días vs. 90 días
                    </th>
                    <th className={TH} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-borde">
                  {lista.map((e) => (
                    <Fragment key={e.estacionId}>
                      <FilaEstacion e={e} minCargas={data.minCargas} abierta={abierta === e.estacionId} onAlternar={() => setAbierta(abierta === e.estacionId ? null : e.estacionId)} />
                      {abierta === e.estacionId && (
                        <tr>
                          <td colSpan={COLUMNAS.length + 4} className="bg-fondo px-4 py-3">
                            <DetalleEstacion e={e} dias={dias} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <p className="text-xs text-tinta-suave">
            Las estaciones con menos de {data.minCargas} cargas en el período se muestran sin indicadores (parámetro fue.estacion_min_cargas).
          </p>
        </>
      )}
    </div>
  );
}

function BotonOrden({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cn('hover:text-tinta', activo && 'font-semibold text-tinta underline')}>
      {children}
    </button>
  );
}

function Tendencia({ t }: { t: EstacionPatron['tendencia'] }) {
  if (!t || t.sentido === 'sin_datos') return <span className="text-xs text-tinta-suave">Pocas cargas en 30 días</span>;
  const pct = t.cambioPct === null ? '' : ` ${t.cambioPct > 0 ? '+' : ''}${formatearNumero(t.cambioPct, 0)} %`;
  if (t.sentido === 'empeora')
    return (
      <span className="inline-flex items-center gap-1 font-medium text-error">
        <ArrowUp className="size-4" /> Empeora{pct}
      </span>
    );
  if (t.sentido === 'mejora')
    return (
      <span className="inline-flex items-center gap-1 font-medium text-exito">
        <ArrowDown className="size-4" /> Mejora{pct}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-tinta-suave">
      <Equal className="size-4" /> Estable{pct}
    </span>
  );
}

function FilaEstacion({ e, minCargas, abierta, onAlternar }: { e: EstacionPatron; minCargas: number; abierta: boolean; onAlternar: () => void }) {
  const nombre = (
    <>
      <span className="font-medium">{e.estacion}</span>
      <span className="block text-xs text-tinta-suave">
        {e.pais ?? ''}
        {e.tanquePropio && ' · tanque propio'} · última carga {haceCuanto(e.ultimaCarga).toLowerCase()}
      </span>
    </>
  );
  if (!e.suficiente)
    return (
      <tr className="text-tinta-suave">
        <td className={TD}>—</td>
        <td className={TD}>{nombre}</td>
        <td className={cn(TD, 'text-right tabular-nums')}>{e.cargas}</td>
        <td className={cn(TD, 'text-right tabular-nums')}>{num(e.litros, 0)} L</td>
        <td className={TD} colSpan={COLUMNAS.length + 1}>
          Pocas cargas para comparar (mínimo {minCargas})
        </td>
        <td className={TD} />
      </tr>
    );
  const indice = e.indice;
  return (
    <tr className={cn(indice !== null && indice >= 1.5 && 'bg-alerta-suave/30')}>
      <td className={cn(TD, 'tabular-nums')}>{e.posicion}</td>
      <td className={TD}>{nombre}</td>
      <td className={cn(TD, 'text-right tabular-nums')}>
        {e.cargas}
        <span className="block text-xs text-tinta-suave">{e.viajes} viaje(s)</span>
      </td>
      <td className={cn(TD, 'text-right tabular-nums')}>{num(e.litros, 0)} L</td>
      <td className={cn(TD, 'text-right tabular-nums')}>
        <span className="font-semibold">{num(e.faltanteAsociadoL)} L</span>
        <span className="block text-xs text-tinta-suave">
          desc. {num(e.descontadoAsociadoL)} · just. {num(e.justificadoAsociadoL)}
        </span>
      </td>
      <td className={cn(TD, 'text-right tabular-nums')}>
        {num(e.faltantePorMilL, 2)} L
        {indice !== null && <span className={cn('block text-xs', indice >= 1.5 ? 'font-semibold text-alerta' : 'text-tinta-suave')}>{formatearNumero(indice, 1)}x</span>}
      </td>
      <td className={cn(TD, 'text-right tabular-nums', (e.cargasImposibles ?? 0) > 0 && 'font-semibold text-error')}>{e.cargasImposibles ?? 0}</td>
      <td className={cn(TD, 'text-right tabular-nums')}>
        {num(e.pctIncidentes)} %
        <span className="block text-xs text-tinta-suave">
          comb. {e.incidentesCombustible ?? 0} · oper. {e.incidentesOperativos ?? 0}
        </span>
      </td>
      <td className={cn(TD, 'text-right')}>{haceCuanto(e.ultimoIncidente)}</td>
      <td className={TD}>
        <Tendencia t={e.tendencia} />
      </td>
      <td className={cn(TD, 'text-right')}>
        <button type="button" className="inline-flex items-center gap-1 text-xs text-marca hover:underline" onClick={onAlternar} aria-expanded={abierta}>
          Detalle {abierta ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </button>
      </td>
    </tr>
  );
}

function DetalleEstacion({ e, dias }: { e: EstacionPatron; dias: number }) {
  const { zonaHoraria } = useSesion();
  const { data, isPending, isError, refetch } = useDetalleEstacion(e.estacionId, dias);
  if (isPending) return <Cargando texto="Cargando las cargas con incidente…" />;
  if (isError) return <ErrorLectura texto="No se pudo leer el detalle." onReintentar={() => refetch()} />;
  if (data.length === 0) return <p className="text-sm text-tinta-suave">Sin cargas con incidente en el período.</p>;
  return (
    <ul className="space-y-2">
      {data.map((c) => (
        <li key={c.cargaId} className="rounded-lg border border-borde bg-panel p-3 text-sm">
          <p className="flex flex-wrap items-center gap-x-2">
            <NombreEnlazado tipo="carga" id={c.cargaId} className="font-medium text-marca hover:underline">
              {formatearNumero(c.litros, 0)} L · {formatearFechaHora(c.fechaHora, zonaHoraria)}
            </NombreEnlazado>
            <span className="text-tinta-suave">
              {c.tractor ?? '—'} · {c.chofer ?? 'chofer sin identificar'}
            </span>
            {c.cierreId && (
              <Link href={`/combustible/cierres/${c.cierreId}`} className="text-xs text-marca hover:underline">
                Viaje {c.cierre ?? c.cierreId}
              </Link>
            )}
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <GrupoIncidentes titulo="Combustible" tono="error" lista={c.combustible} />
            <GrupoIncidentes titulo="Operativos" tono="alerta" lista={c.operativos} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function GrupoIncidentes({ titulo, tono, lista }: { titulo: string; tono: 'error' | 'alerta'; lista: IncidenteCarga[] }) {
  return (
    <div className={cn('rounded-md border p-2', lista.length > 0 ? (tono === 'error' ? 'border-error/40' : 'border-alerta/40') : 'border-borde')}>
      <p className="mb-1 text-xs font-medium text-tinta-suave">Incidentes {titulo.toLowerCase()}</p>
      {lista.length === 0 ? (
        <p className="text-xs text-tinta-suave">Ninguno</p>
      ) : (
        <ul className="space-y-1">
          {lista.map((i, k) => (
            <li key={k} className="flex flex-wrap items-center gap-1.5">
              <Chip tono={i.tipo === 'viaje_con_faltante' && i.decision === 'justificar' ? 'neutro' : tono}>
                {i.tipo === 'carga_lejos' && <MapPin className="size-3" />}
                {ETIQUETA_INCIDENTE[i.tipo] ?? i.tipo}
              </Chip>
              {i.tipo === 'viaje_con_faltante' && (
                <span className="text-xs text-tinta-suave">
                  faltaron {num(i.faltanteViajeL ?? null)} L en el viaje · esta carga fue el {num(i.partePct ?? null, 0)} % → {num(i.asociadoL ?? null)} L asociados ·{' '}
                  {i.decision === 'justificar' ? 'justificado' : i.decision === 'descontar' ? 'descontado' : 'sin decisión'}
                </span>
              )}
              {i.alertaId && (
                <Link href="/anomalias/alertas" className="text-xs text-marca hover:underline">
                  alerta {i.alertaId}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
