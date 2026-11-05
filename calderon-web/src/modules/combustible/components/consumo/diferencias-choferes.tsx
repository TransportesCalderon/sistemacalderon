'use client';

import { useState } from 'react';
import { Users } from 'lucide-react';
import { TD, TH } from '@/modules/catalogos/components/comun';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { hoyEnZona } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { CONTROL_FILTRO } from '@/shared/ui/clases';
import { periodoAcumulado } from '../../domain/decision.types';
import { useDiferenciasChoferes } from '../../queries/hooks';
import { Cargando, ErrorLectura, Vacio } from '../comun/ui';
import { Cifra } from './periodo';

const num = (v: number | null, d = 1) => (v === null ? '—' : formatearNumero(v, d));

/**
 * Migración 185 · Diferencias acumuladas por chofer (cierres aprobados), en el mes o en el trimestre:
 * cantidad de viajes con faltante, litros acumulados, promedio por viaje y ranking. Cuenta todo litro que
 * faltó y lo separa en descontado, justificado y dentro de la tolerancia (migración 193). Lo calcula la base.
 */
export function DiferenciasChoferes() {
  const { zonaHoraria } = useSesion();
  const [mes, setMes] = useState(() => hoyEnZona(zonaHoraria).slice(0, 7));
  const [trimestre, setTrimestre] = useState(false);
  const p = periodoAcumulado(mes, trimestre);
  const { data, isPending, isError, error, refetch, isFetching } = useDiferenciasChoferes(p.desde, p.hasta, true);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-4">
        <label className="text-sm">
          <span className="block text-xs text-tinta-suave">{trimestre ? 'Trimestre hasta' : 'Mes'}</span>
          <input type="month" className={CONTROL_FILTRO} value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} />
        </label>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" className="accent-marca" checked={trimestre} onChange={(e) => setTrimestre(e.target.checked)} /> Trimestre (3 meses)
        </label>
        <span className="text-xs text-tinta-suave">
          Del {p.desde.split('-').reverse().join('/')} al {p.hasta.split('-').reverse().join('/')} · cierres aprobados, por fecha de llegada
        </span>
      </div>

      {isPending ? (
        <Cargando texto="Sumando las diferencias…" />
      ) : isError ? (
        <ErrorLectura texto={error instanceof Error ? error.message : 'No se pudo calcular.'} onReintentar={() => refetch()} />
      ) : data.choferes.length === 0 ? (
        <Vacio icono={<Users className="size-6" />} texto="No hay cierres aprobados en el período." />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Cifra etiqueta="Viajes" valor={String(data.total.viajes)} detalle={`${data.total.viajesFaltante} con faltante`} />
            <Cifra etiqueta="Litros que faltaron" valor={`${formatearNumero(data.total.litrosFaltante, 0)} L`} alerta={data.total.litrosFaltante > 0} />
            <Cifra
              etiqueta="Descontados"
              valor={`${formatearNumero(data.total.litrosDescontados, 0)} L`}
              detalle={data.total.pctDescontado === null ? undefined : `${data.total.pctDescontado} % de lo que faltó`}
            />
            <Cifra
              etiqueta="Justificados"
              valor={`${formatearNumero(data.total.litrosJustificados, 0)} L`}
              detalle={data.total.pctJustificado === null ? undefined : `${data.total.pctJustificado} % de lo que faltó`}
            />
            {/* Migración 193: error normal de medición (% de lo cargado), no se le descuenta al chofer */}
            <Cifra
              etiqueta="Dentro de la tolerancia"
              valor={`${formatearNumero(data.total.litrosTolerancia, 0)} L`}
              detalle={data.total.pctTolerancia === null ? 'error normal de medición' : `${data.total.pctTolerancia} % de lo que faltó · error de medición`}
            />
          </div>
          <section className="overflow-hidden rounded-xl border border-borde bg-panel">
            <div className="overflow-x-auto">
              <table className={cn('w-full min-w-[1050px] text-sm', isFetching && 'opacity-70')}>
                <thead className="border-b border-borde bg-fondo">
                  <tr>
                    <th className={TH}>#</th>
                    <th className={TH}>Chofer</th>
                    <th className={cn(TH, 'text-right')}>Viajes</th>
                    <th className={cn(TH, 'text-right')}>Con faltante</th>
                    <th className={cn(TH, 'text-right')}>Litros que faltaron</th>
                    <th className={cn(TH, 'text-right')}>Promedio por viaje</th>
                    <th className={cn(TH, 'text-right')}>Cada 1.000 km</th>
                    <th className={cn(TH, 'text-right')}>Descontados</th>
                    <th className={cn(TH, 'text-right')}>Justificados</th>
                    <th className={cn(TH, 'text-right')} title="Error normal de medición (% de lo cargado): no se descuenta">
                      Tolerancia
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borde">
                  {data.choferes.map((c) => (
                    <tr key={c.choferId} className={cn(c.puesto <= 3 && c.litrosFaltante > 0 && 'bg-alerta-suave/40')}>
                      <td className={cn(TD, 'tabular-nums')}>{c.puesto}</td>
                      <td className={cn(TD, 'font-medium')}>{c.chofer}</td>
                      <td className={cn(TD, 'text-right tabular-nums')}>{c.viajes}</td>
                      <td className={cn(TD, 'text-right tabular-nums')}>
                        {c.viajesFaltante}
                        {c.pctViajesFaltante !== null && <span className="text-xs text-tinta-suave"> ({c.pctViajesFaltante} %)</span>}
                      </td>
                      <td className={cn(TD, 'text-right font-semibold tabular-nums', c.litrosFaltante > 0 && 'text-alerta')}>{num(c.litrosFaltante)} L</td>
                      <td className={cn(TD, 'text-right tabular-nums')}>{num(c.promedioPorViaje)} L</td>
                      <td className={cn(TD, 'text-right tabular-nums')}>{c.litrosCada1000Km === null ? '—' : `${num(c.litrosCada1000Km)} L`}</td>
                      <td className={cn(TD, 'text-right tabular-nums')}>
                        {num(c.litrosDescontados)} L
                        {c.pctDescontado !== null && <span className="block text-xs text-tinta-suave">{c.pctDescontado} %</span>}
                      </td>
                      <td className={cn(TD, 'text-right tabular-nums')}>
                        {num(c.litrosJustificados)} L
                        {c.pctJustificado !== null && <span className="text-xs text-tinta-suave"> · {c.pctJustificado} %</span>}
                        {c.viajesJustificados > 0 && <span className="text-xs text-tinta-suave"> ({c.viajesJustificados} viaje/s)</span>}
                      </td>
                      <td className={cn(TD, 'text-right tabular-nums text-tinta-suave')}>
                        {num(c.litrosTolerancia)} L
                        {c.pctTolerancia !== null && <span className="block text-xs">{c.pctTolerancia} %</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
