'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BarChart3 } from 'lucide-react';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora, hoyEnZona } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { CONTROL_FILTRO, TARJETA } from '@/shared/ui/clases';
import { rangoMes, type FilaTableroGenset } from '../../domain/genset.types';
import { useTableroGensets } from '../../queries/hooks';
import { Cargando, Chip, ErrorLectura, Vacio } from '../comun/ui';

const TH = 'px-3 py-2.5 whitespace-nowrap';
const TD = 'px-3 py-2.5 align-top';

/**
 * Migración 203 · Tablero de gensets: por genset y mes, litros, importe (lo que fue a viajes y lo que quedó
 * sin imputar), horas de uso y L/h real (de las vueltas cerradas en el mes) contra el esperado de su ficha.
 * Todo lo calcula la base (fue.fn_tablero_gensets).
 */
export function TableroGensets() {
  const { zonaHoraria } = useSesion();
  const [mes, setMes] = useState<string>(hoyEnZona(zonaHoraria).slice(0, 7));
  const { desde, hasta } = rangoMes(mes);
  const { data, isPending, isError, error, refetch, isFetching } = useTableroGensets(desde, hasta);
  const imp = (v: number | null) => (v === null ? '—' : `${data?.moneda ?? ''} ${formatearNumero(v, 0)}`);
  const conMovimiento = (data?.filas ?? []).filter((f) => f.cargas > 0 || f.litrosDescargados > 0 || (f.horas ?? 0) > 0);
  const sinImputar = (data?.filas ?? []).flatMap((f) => f.sinImputarDetalle.map((d) => ({ ...d, genset: f.genset })));

  return (
    <div className="space-y-4">
      <section className={cn(TARJETA, 'flex flex-wrap items-center gap-2 p-3')} aria-label="Mes">
        <label className="flex items-center gap-1.5 text-sm text-tinta-suave">
          Mes
          <input type="month" className={CONTROL_FILTRO} value={mes} onChange={(e) => setMes(e.target.value)} />
        </label>
        {data && (
          <span className="ml-auto text-sm text-tinta-suave">
            {data.totales.cargas} carga(s) · {formatearNumero(data.totales.litrosCargados, 0)} L · {imp(data.totales.importe)}
          </span>
        )}
      </section>

      {isPending ? (
        <Cargando texto="Calculando el tablero de gensets…" />
      ) : isError ? (
        <ErrorLectura texto="No se pudo calcular el tablero de gensets." error={error} onReintentar={() => void refetch()} />
      ) : conMovimiento.length === 0 ? (
        <Vacio icono={<BarChart3 className="size-6" />} texto="Ningún genset tuvo cargas ni uso en ese mes." />
      ) : (
        <>
          <div className={cn(TARJETA, 'overflow-x-auto', isFetching && 'opacity-80')}>
            <table className="w-full min-w-[960px] text-sm">
              <thead className="border-b border-borde bg-fondo text-left text-xs font-medium tracking-wide text-tinta-suave uppercase">
                <tr>
                  <th className={TH}>Genset</th>
                  <th className={cn(TH, 'text-right')}>Cargas</th>
                  <th className={cn(TH, 'text-right')}>Litros</th>
                  <th className={cn(TH, 'text-right')}>Importe</th>
                  <th className={cn(TH, 'text-right')}>A operaciones</th>
                  <th className={cn(TH, 'text-right')}>Horas</th>
                  <th className={cn(TH, 'text-right')}>L/h real</th>
                  <th className={cn(TH, 'text-right')}>L/h esperado</th>
                  <th className={TH}>Desvío</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {conMovimiento.map((f) => (
                  <Fila key={f.gensetId} f={f} imp={imp} />
                ))}
              </tbody>
              <tfoot className="border-t border-borde font-semibold">
                <tr>
                  <td className={TD}>Total</td>
                  <td className={cn(TD, 'text-right tabular-nums')}>{data.totales.cargas}</td>
                  <td className={cn(TD, 'text-right tabular-nums')}>{formatearNumero(data.totales.litrosCargados, 0)}</td>
                  <td className={cn(TD, 'text-right tabular-nums')}>{imp(data.totales.importe)}</td>
                  <td className={cn(TD, 'text-right tabular-nums')}>{imp(data.totales.importeImputado)}</td>
                  <td className={cn(TD, 'text-right tabular-nums')}>{data.totales.horas === null ? '—' : formatearNumero(data.totales.horas, 1)}</td>
                  <td className={TD} colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-xs text-tinta-suave">
            «A operaciones» es lo que se sumó al costo del viaje del tractor que llevaba el genset (y a la rentabilidad). El L/h real sale de las vueltas (de
            tanque lleno a tanque lleno) que terminaron en el mes.
          </p>

          {sinImputar.length > 0 && (
            <section className={cn(TARJETA, 'p-4')}>
              <h3 className="mb-2 text-sm font-semibold text-tinta">Cargas sin imputar a una operación ({sinImputar.length})</h3>
              <ul className="divide-y divide-borde text-sm">
                {sinImputar.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-baseline gap-x-3 py-1.5">
                    <span className="tabular-nums">{formatearFechaHora(d.fechaHora, zonaHoraria)}</span>
                    <span className="font-mono font-semibold">{d.genset}</span>
                    <span className="tabular-nums">{formatearNumero(d.litros, 1)} L</span>
                    <span className="tabular-nums">{imp(d.importeBase)}</span>
                    <span className="text-tinta-suave">{d.motivo ?? ''}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Fila({ f, imp }: { f: FilaTableroGenset; imp: (v: number | null) => string }) {
  const desvio = f.desvioPct;
  return (
    <tr>
      <td className={TD}>
        <Link href={`/flota/gensets/${f.gensetId}`} className="font-mono font-semibold text-marca hover:underline">
          {f.genset}
        </Link>
        {f.semi && <span className="block text-xs text-tinta-suave">semi {f.semi}</span>}
      </td>
      <td className={cn(TD, 'text-right tabular-nums')}>{f.cargas}</td>
      <td className={cn(TD, 'text-right tabular-nums')}>
        {formatearNumero(f.litrosCargados, 0)}
        {f.litrosBase > 0 && <span className="block text-xs text-tinta-suave">{formatearNumero(f.litrosBase, 0)} de la base</span>}
        {f.litrosDescargados > 0 && <span className="block text-xs text-tinta-suave">−{formatearNumero(f.litrosDescargados, 0)} descargados</span>}
      </td>
      <td className={cn(TD, 'text-right tabular-nums')}>
        {imp(f.importe)}
        {f.estimado && <span className="block text-xs text-alerta">en parte estimado</span>}
      </td>
      <td className={cn(TD, 'text-right tabular-nums')}>
        {imp(f.importeImputado)}
        {f.sinImputar > 0 && <span className="block text-xs text-alerta">{f.sinImputar} sin imputar</span>}
      </td>
      <td className={cn(TD, 'text-right tabular-nums')}>{f.horas === null ? '—' : formatearNumero(f.horas, 1)}</td>
      <td className={cn(TD, 'text-right tabular-nums')}>
        {f.consumoRealLh === null ? <span className="text-tinta-suave">sin vueltas</span> : formatearNumero(f.consumoRealLh, 2)}
      </td>
      <td className={cn(TD, 'text-right tabular-nums')}>{f.consumoLh === null ? <span className="text-xs text-alerta">sin cargar</span> : formatearNumero(f.consumoLh, 2)}</td>
      <td className={TD}>
        {desvio === null ? (
          <span className="text-tinta-suave">—</span>
        ) : (
          <Chip tono={desvio > 10 ? 'alerta' : desvio < -10 ? 'neutro' : 'exito'}>
            {desvio > 0 ? '+' : ''}
            {formatearNumero(desvio, 1)} %
          </Chip>
        )}
      </td>
    </tr>
  );
}
