'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Info, TrendingUp } from 'lucide-react';
import { TD, TH } from '@/modules/catalogos/components/comun';
import { Cargando, Chip, Encabezado, ErrorLectura, Vacio } from '@/modules/combustible/components/comun/ui';
import { Cifra, FiltroPeriodo } from '@/modules/combustible/components/consumo/periodo';
import { parsearPeriodo, type PeriodoParams } from '@/modules/combustible/domain/consumo.types';
import { formatoNumero } from '@/modules/logistica/components/viaje-chofer-comun';
import { useSesion } from '@/modules/core/session/session-provider';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { cn } from '@/shared/lib/cn';
import { hoyEnZona } from '@/shared/lib/fechas';
import { NombreEnlazado } from '@/shared/ui/nombre-enlazado';
import { AGRUPACIONES, ETIQUETA_AGRUPACION, esAgrupacion, VERSION_RENTABILIDAD, type Agrupacion, type FilaRentabilidad } from '../domain/rentabilidad';
import { useRentabilidad } from '../queries/hooks';

const RUTA = '/analisis/rentabilidad';
const FICHA = { viaje: 'viaje', chofer: 'chofer', camion: 'camion' } as const;

/**
 * IA-1 · Finanzas › Rentabilidad: margen de contribución (lo facturado menos el costo directo de los
 * viajes) por chofer, camión o viaje. Lo calcula la base (fin.fn_rentabilidad, migración 119); los
 * viajes incompletos no suman y se muestran con el motivo que da la base. No depende del asistente de IA.
 */
export function RentabilidadPantalla() {
  const { zonaHoraria } = useSesion();
  const sp = useSearchParams();
  const router = useRouter();
  const p = parsearPeriodo(sp, hoyEnZona(zonaHoraria));
  const agruparUrl = sp.get('por');
  const agrupar: Agrupacion = esAgrupacion(agruparUrl) ? agruparUrl : 'chofer';
  const ir = (n: PeriodoParams, a: Agrupacion) =>
    router.replace(`${RUTA}?${new URLSearchParams({ desde: n.desde, hasta: n.hasta, por: a }).toString()}`, { scroll: false });

  const disponible = useBaseTiene(VERSION_RENTABILIDAD);
  const { data, isPending, isError, error, isFetching, refetch } = useRentabilidad(p.desde, p.hasta, agrupar, disponible);
  const imp = (v: number | null) => (v === null ? '—' : `${data?.moneda ?? ''} ${formatoNumero(v)}`.trim());

  return (
    <div className="space-y-5">
      <Encabezado titulo="Rentabilidad" subtitulo="Finanzas" />
      {!disponible ? (
        <Vacio icono={<TrendingUp className="size-6" />} texto="La base todavía no tiene la rentabilidad. Falta aplicar la migración 119 (104_rentabilidad.sql)." />
      ) : (
        <>
          <p className="max-w-3xl text-sm text-tinta-suave">
            Lo facturado de cada operación menos el costo directo de sus viajes (combustible, canon, costo por km y gastos del viaje). Si una operación
            viaja en relevo, su factura se reparte por los km de cada viaje. Los viajes incompletos no suman: abajo se ve qué les falta.
          </p>
          {data?.aviso && (
            <p className="flex items-start gap-2 rounded-xl border border-alerta/40 bg-alerta-suave px-4 py-3 text-sm font-medium text-alerta">
              <Info className="mt-0.5 size-4 shrink-0" /> {data.aviso}
            </p>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <FiltroPeriodo p={p} onCambiar={(n) => ir(n, agrupar)} />
            <div className="space-y-1 text-sm">
              <span className="block text-xs text-tinta-suave">Ver por</span>
              <div role="tablist" className="inline-flex overflow-hidden rounded-lg border border-borde">
                {AGRUPACIONES.map((a) => (
                  <button
                    key={a}
                    type="button"
                    role="tab"
                    aria-selected={agrupar === a}
                    onClick={() => ir(p, a)}
                    className={cn('h-9 px-3', agrupar === a ? 'bg-marca font-semibold text-white' : 'bg-panel text-tinta hover:bg-hover')}
                  >
                    {ETIQUETA_AGRUPACION[a]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {isPending ? (
            <Cargando texto="Calculando…" />
          ) : isError ? (
            <ErrorLectura texto={error instanceof Error ? error.message : 'No se pudo calcular la rentabilidad.'} onReintentar={() => refetch()} />
          ) : data.filas.length === 0 ? (
            <Vacio icono={<TrendingUp className="size-6" />} texto="No hay viajes de chofer que hayan salido en el período." />
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-4">
                <Cifra etiqueta="Ingreso" valor={imp(data.totales.ingreso)} detalle="De los viajes completos" />
                <Cifra etiqueta="Costo directo" valor={imp(data.totales.costo)} detalle="De los viajes completos" />
                <Cifra etiqueta="Margen de contribución" valor={imp(data.totales.margen)} />
                <Cifra
                  etiqueta="Viajes completos"
                  valor={`${data.totales.completos} de ${data.totales.viajes}`}
                  detalle={data.totales.incompletos > 0 ? `${data.totales.incompletos} incompletos no suman` : undefined}
                  alerta={data.totales.incompletos > 0}
                />
              </div>
              <section className="overflow-hidden rounded-xl border border-borde bg-panel">
                <div className="overflow-x-auto">
                  <table className={cn('w-full min-w-[900px] text-sm', isFetching && 'opacity-70')}>
                    <thead className="border-b border-borde bg-fondo">
                      <tr>
                        <th className={TH}>{ETIQUETA_AGRUPACION[data.agrupar]}</th>
                        <th className={cn(TH, 'text-right')}>Viajes</th>
                        <th className={cn(TH, 'text-right')}>Ingreso</th>
                        <th className={cn(TH, 'text-right')}>Costo</th>
                        <th className={cn(TH, 'text-right')}>Margen</th>
                        <th className={cn(TH, 'text-right')}>%</th>
                        <th className={cn(TH, 'text-right')}>Km</th>
                        <th className={cn(TH, 'text-right')}>Margen por km</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-borde">
                      {data.filas.map((f) => (
                        <Fila key={`${f.id ?? 'sin'}-${f.nombre}`} f={f} agrupar={data.agrupar} imp={imp} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Fila({ f, agrupar, imp }: { f: FilaRentabilidad; agrupar: Agrupacion; imp: (v: number | null) => string }) {
  return (
    <tr className="align-top">
      <td className={TD}>
        {f.id === null ? (
          f.nombre
        ) : (
          <NombreEnlazado tipo={FICHA[agrupar]} id={f.id} className="text-marca hover:underline">
            {f.nombre}
          </NombreEnlazado>
        )}
        {f.incompletos > 0 && (
          <div className="mt-1 space-y-1">
            <Chip tono="alerta">{f.incompletos === 1 ? '1 viaje incompleto' : `${f.incompletos} viajes incompletos`}</Chip>
            <ul className="list-disc pl-4 text-xs text-tinta-suave">
              {f.motivos.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}
      </td>
      <td className={cn(TD, 'text-right tabular-nums')}>{f.incompletos > 0 ? `${f.completos} de ${f.viajes}` : f.viajes}</td>
      <td className={cn(TD, 'text-right tabular-nums')}>{imp(f.ingreso)}</td>
      <td className={cn(TD, 'text-right tabular-nums')}>{imp(f.costo)}</td>
      <td className={cn(TD, 'text-right font-semibold tabular-nums')}>{imp(f.margen)}</td>
      <td className={cn(TD, 'text-right tabular-nums')}>{f.margenPct === null ? '—' : `${formatoNumero(f.margenPct, 1)} %`}</td>
      <td className={cn(TD, 'text-right tabular-nums')}>{formatoNumero(f.km)}</td>
      <td className={cn(TD, 'text-right tabular-nums')}>{imp(f.margenKm)}</td>
    </tr>
  );
}
