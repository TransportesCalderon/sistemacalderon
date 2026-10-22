'use client';

import { useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, ClipboardList } from 'lucide-react';
import { TD, TH } from '@/modules/catalogos/components/comun';
import { Cargando, Encabezado, ErrorLectura, Vacio } from '@/modules/combustible/components/comun/ui';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { formatearFechaDia, hoyEnZona } from '@/shared/lib/fechas';
import { BOTON_ICONO, TARJETA } from '@/shared/ui/clases';
import { dinero, nombrePeriodo } from '../domain/chofer.types';
import { usePeriodoDe, useResumenLiquidacion } from '../queries/hooks';

const mover = (periodo: string, meses: number) => {
  const [a, m] = periodo.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(a, m - 1 + meses, 1)).toISOString().slice(0, 10);
};

/**
 * RRHH › Liquidación: por chofer y período (del 26 al 25), lo que hay que tener en cuenta al
 * liquidar. Solo informa: lo calcula la base. Los sueldos se siguen liquidando como hoy.
 */
export function ResumenLiquidacionPantalla() {
  const { zonaHoraria } = useSesion();
  const actual = usePeriodoDe(hoyEnZona(zonaHoraria));
  const [elegido, setElegido] = useState<string | null>(null);
  const periodo = elegido ?? (actual.data ? mover(actual.data, -1) : null);
  const { data, isLoading, isError, refetch } = useResumenLiquidacion(periodo);

  return (
    <div className="space-y-4">
      <Encabezado titulo="Resumen para liquidar" subtitulo="Administración" />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={BOTON_ICONO} aria-label="Período anterior" disabled={!periodo} onClick={() => periodo && setElegido(mover(periodo, -1))}>
          <ChevronLeft className="size-4" />
        </button>
        <div>
          <p className="font-semibold text-tinta">{periodo ? nombrePeriodo(periodo) : '…'}</p>
          {data && (
            <p className="text-xs text-tinta-suave">
              Del {formatearFechaDia(data.desde)} al {formatearFechaDia(data.hasta)}
            </p>
          )}
        </div>
        <button type="button" className={BOTON_ICONO} aria-label="Período siguiente" disabled={!periodo} onClick={() => periodo && setElegido(mover(periodo, 1))}>
          <ChevronRight className="size-4" />
        </button>
      </div>
      <p className="text-sm text-tinta-suave">
        Combustible: los cierres de viaje aprobados en el período (litros a descontar × precio promedio del mes). Ralentí: los cierres de ralentí hechos
        en el período. Fondo: el saldo al cierre del período (si todavía no se cerró, el saldo de hoy). A descontar = combustible + ralentí + fondo; en
        verde, a favor del chofer.
      </p>

      {isLoading || !periodo ? (
        <Cargando texto="Armando el resumen…" />
      ) : isError || !data ? (
        <ErrorLectura texto="No se pudo armar el resumen." onReintentar={() => void refetch()} />
      ) : data.choferes.length === 0 ? (
        <Vacio icono={<ClipboardList className="size-6" />} texto="No hay viajes, descuentos ni fondos en este período." />
      ) : (
        <div className={cn(TARJETA, 'overflow-x-auto')}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-borde">
                <th className={TH}>Chofer</th>
                <th className={cn(TH, 'text-right')}>Viajes</th>
                <th className={cn(TH, 'text-right')}>Km de línea</th>
                <th className={cn(TH, 'text-right')}>Combustible</th>
                <th className={cn(TH, 'text-right')}>Ralentí</th>
                <th className={cn(TH, 'text-right')}>Fondo</th>
                <th className={cn(TH, 'text-right')}>A descontar ({data.monedaBase})</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {data.choferes.map((c) => (
                <tr key={c.choferId}>
                  <td className={TD}>
                    <span className="font-medium text-tinta">{c.chofer}</span>
                    {c.legajo && <span className="block text-xs text-tinta-suave">Legajo {c.legajo}</span>}
                    {c.gastosPorRevisar > 0 && (
                      <span className="mt-1 inline-flex items-center gap-1 text-xs text-alerta">
                        <AlertTriangle className="size-3.5" /> {c.gastosPorRevisar} gasto(s) por revisar
                      </span>
                    )}
                  </td>
                  <td className={cn(TD, 'text-right tabular-nums')} title={c.viajesNumeros ?? undefined}>
                    {c.viajes}
                  </td>
                  <td className={cn(TD, 'text-right tabular-nums')}>{c.kmLinea !== null ? c.kmLinea.toLocaleString('es-AR') : '—'}</td>
                  <td className={cn(TD, 'text-right tabular-nums')} title={c.combustibleCierres ?? undefined}>
                    {c.combustibleL ? (
                      <>
                        {dinero(c.combustibleImporte)}
                        <span className="block text-xs text-tinta-suave">{c.combustibleL.toLocaleString('es-AR')} L</span>
                        {c.combustibleSinPrecio && <span className="block text-xs text-alerta">sin precio del mes</span>}
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className={cn(TD, 'text-right tabular-nums')} title={c.ralentiCierres ?? undefined}>
                    {c.ralentiImporte ? (
                      <>
                        {dinero(c.ralentiImporte)}
                        <span className="block text-xs text-tinta-suave">{c.ralentiL?.toLocaleString('es-AR')} L de exceso</span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className={cn(TD, 'text-right tabular-nums')}>
                    {c.fondo.length === 0
                      ? '—'
                      : c.fondo.map((f) => (
                          <span key={f.moneda} className={cn('block', f.saldo < 0 && 'text-exito')}>
                            {dinero(f.saldo, f.moneda)}
                          </span>
                        ))}
                    <span className="block text-xs text-tinta-suave">{c.fondo.length > 0 && (c.fondoCerrado ? 'cerrado' : 'sin cerrar')}</span>
                    {c.fondoSinCotizacion && <span className="block text-xs text-alerta">falta cotización</span>}
                  </td>
                  <td className={cn(TD, 'text-right font-semibold tabular-nums', c.aDescontar < 0 && 'text-exito')}>{dinero(c.aDescontar)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
