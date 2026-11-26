'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Cargando, Encabezado, ErrorLectura, Seccion } from '@/modules/combustible/components/comun/ui';
import { TD, TH } from '@/modules/catalogos/components/comun';
import { cn } from '@/shared/lib/cn';
import { dinero, mesCorto, type TableroFinanzas as Tablero } from '../domain/finanzas.types';
import { useEstimadoChoferes, useTableroFinanzas } from '../queries/hooks';
import { principalesConEstimado } from '../domain/estimado-choferes';
import { fecha } from './comun';
import { formatearNumero } from '@/shared/lib/numeros';
import { Aviso, Indicador } from './comun';
import { GraficoIngresosGastos, GraficoPrincipales, GraficoResultado } from './graficos';
import { dolarDeCadaMes, tableroEn, type MonedaTablero } from '../domain/tablero-moneda';

/**
 * Finanzas › Tablero financiero (antes «Resumen»; 20/11/2026, cambio 8): plata disponible, lo que nos deben y lo que
 * debemos, y cómo vienen los meses. Cambio 10: los avisos llevan a la dirección vigente (no a la vieja que redirige).
 */
export function TableroFinanzas() {
  const { data: t, isLoading, isError, error, refetch } = useTableroFinanzas();
  const estimado = useEstimadoChoferes();
  // Migración 372: ver el tablero en pesos chilenos o en dólares
  const [moneda, setMoneda] = useState<MonedaTablero>('CLP');
  if (isLoading) return <Cargando texto="Armando el tablero…" />;
  if (isError || !t) return <ErrorLectura texto="No se pudo leer el tablero financiero." onReintentar={() => void refetch()} error={error} />;

  const tv = tableroEn(t, moneda);
  const m: MonedaTablero = tv === t ? 'CLP' : 'USD';
  const din = (x: number) => dinero(x, m);
  const dolarMes = m === 'USD' ? (dolarDeCadaMes(t).at(-1) ?? t.tcUsd ?? 1) : 1;
  const est = estimado.data
    ? { ...estimado.data, total: estimado.data.total / dolarMes, bono: estimado.data.bono / dolarMes, adicionalKm: estimado.data.adicionalKm / dolarMes }
    : estimado.data;
  const egresos = tv.costos.map((c, i) => c + (tv.gastos[i] ?? 0));
  const sinDatos = tv.bancos.length === 0 && tv.ingresos.every((v) => v === 0) && egresos.every((v) => v === 0);

  return (
    <div className="space-y-5">
      <Encabezado titulo="Tablero financiero" subtitulo="Finanzas">
        <ElegirMoneda moneda={moneda} onCambiar={setMoneda} t={t} />
      </Encabezado>

      {sinDatos && (
        <Aviso>
          Para empezar: cargá tus cuentas en{' '}
          <Link href="/conciliacion" className="font-medium underline">
            Bancos
          </Link>{' '}
          (con el saldo de hoy), los gastos que se repiten en{' '}
          <Link href="/ajustes/gastos-fijos" className="font-medium underline">
            Gastos fijos
          </Link>{' '}
          y los gastos del mes en{' '}
          <Link href="/analisis/gastos" className="font-medium underline">
            Gastos
          </Link>
          .
        </Aviso>
      )}
      {t.fijosSinGenerar > 0 && (
        <Aviso>
          Faltan generar {t.fijosSinGenerar === 1 ? '1 gasto fijo' : `${t.fijosSinGenerar} gastos fijos`} de este mes.{' '}
          <Link href="/ajustes/gastos-fijos" className="font-medium underline">
            Generarlos
          </Link>
        </Aviso>
      )}
      {t.porConciliar > 0 && (
        <Aviso>
          Hay {t.porConciliar} {t.porConciliar === 1 ? 'línea' : 'líneas'} de la cartola sin conciliar.{' '}
          <Link href="/conciliacion" className="font-medium underline">
            Conciliar
          </Link>
        </Aviso>
      )}
      {t.facturasSinAsiento > 0 && (
        <Aviso>
          {t.facturasSinAsiento === 1 ? 'Una factura emitida no tiene' : `${t.facturasSinAsiento} facturas emitidas no tienen`} asiento porque falta el tipo de cambio del día.
          Cargalo en{' '}
          <Link href="/ajustes/monedas/tipos-cambio" className="font-medium underline">
            Monedas y tipos de cambio
          </Link>{' '}
          y después tocá «Rehacer asientos» en el Plan de cuentas.
        </Aviso>
      )}
      {t.pendientesContables > 0 && (
        <Aviso>
          {t.pendientesContables === 1 ? 'Un documento no entró' : `${t.pendientesContables} documentos no entraron`} a la contabilidad.{' '}
          <Link href="/ajustes/plan-cuentas" className="font-medium underline">
            Ver por qué
          </Link>
        </Aviso>
      )}
      {tv.cobrosSinCuentaClp !== 0 && (
        <Aviso>
          Hay {din(tv.cobrosSinCuentaClp)} de facturas cobradas sin decir a qué banco entraron.{' '}
          <Link href="/analisis/cobros-pagos?ver=cobrar" className="font-medium underline">
            Decir el banco
          </Link>
        </Aviso>
      )}

      <IndicadoresFinanzas t={tv} moneda={m} />

      {/* Migración 367: qué entra y qué sale cada semana, y si la caja alcanza */}
      <p className="text-sm">
        <Link href="/analisis/cobros-pagos?ver=plan" className="font-medium text-marca hover:underline">
          ¿Alcanza la caja? Ver el planificador de caja →
        </Link>
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador
          titulo="Fletes entregados sin facturar"
          valor={din(tv.fletesPorFacturarClp)}
          detalle="ya son ingreso; falta emitir la factura"
          href="/analisis/informes"
        />
        {/* 20/11/2026 (plan de simplificación, cambio 1): el detalle está en Por pagar › Detalle por estación */}
        <Indicador
          titulo="Combustible sin factura del proveedor"
          valor={din(tv.combustiblePorFacturarClp)}
          detalle="cargas en cuenta corriente o tarjeta"
          href="/analisis/cobros-pagos?ver=pagar&estaciones=1"
        />
        <Indicador titulo="Fondos de choferes por rendir" valor={din(tv.fondosChoferesClp)} detalle="plata entregada que falta rendir" href="/liquidaciones/fondos" />
        <Indicador titulo="Sueldos y leyes sociales por pagar" valor={din(tv.sueldosPorPagarClp)} detalle="liquidaciones aprobadas sin pagar" href="/liquidaciones" />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Seccion titulo="Ingresos y gastos de los últimos 12 meses">
          <GraficoIngresosGastos meses={t.meses} ingresos={tv.ingresos} egresos={egresos} moneda={m} />
        </Seccion>
        <Seccion titulo="Resultado de cada mes">
          <GraficoResultado meses={t.meses} resultado={tv.resultado} moneda={m} />
        </Seccion>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Seccion titulo="En qué se fue la plata este mes">
          {tv.principalesGastos.length === 0 && !est?.total ? (
            <p className="text-sm text-tinta-suave">Todavía no hay gastos cargados este mes.</p>
          ) : (
            <GraficoPrincipales items={principalesConEstimado(tv.principalesGastos, est)} moneda={m} />
          )}
          {/* Migración 366: bono y km de los choferes, hasta que se apruebe la liquidación */}
          {estimado.isLoading && <p className="mt-3 text-xs text-tinta-suave">Calculando el bono y los km de los choferes…</p>}
          {est && est.total > 0 && (
            <p className="mt-3 text-xs text-tinta-suave">
              Choferes (en claro): bono por tramo {din(est.bono)} y {din(est.adicionalKm)} por {formatearNumero(est.km, 0)} km de línea, de{' '}
              {est.choferes} chofer{est.choferes === 1 ? '' : 'es'}, con los movimientos de Operaciones del {fecha(est.desde)} al{' '}
              {fecha(est.hasta)}. Es un estimado: cuando se aprueba la liquidación pasa a «Remuneraciones de choferes» con el monto real.
            </p>
          )}
        </Seccion>
        <Seccion titulo="Saldos por cuenta">
          {tv.bancos.length === 0 ? (
            <p className="text-sm text-tinta-suave">Todavía no hay bancos ni cajas.</p>
          ) : (
            <ul className="divide-y divide-borde text-sm">
              {tv.bancos.map((b) => (
                <li key={b.nombre} className="flex items-baseline justify-between gap-3 py-2">
                  <span className="text-tinta">{b.nombre}</span>
                  <span className="text-right tabular-nums">
                    <span className={cn('font-medium', b.saldo < 0 ? 'text-error' : 'text-tinta')}>{dinero(b.saldo, b.moneda)}</span>
                    {b.moneda !== m && b.saldoClp !== null && <span className="block text-xs text-tinta-suave">≈ {din(b.saldoClp)}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Seccion>
      </div>

      <details className="rounded-lg border border-borde bg-panel p-3 text-sm">
        <summary className="cursor-pointer font-medium text-tinta">Ver los números del gráfico como tabla</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="border-b border-borde">
              <tr>
                <th className={TH}>Mes</th>
                <th className={cn(TH, 'text-right')}>Ingresos</th>
                <th className={cn(TH, 'text-right')}>Costos</th>
                <th className={cn(TH, 'text-right')}>Gastos</th>
                <th className={cn(TH, 'text-right')}>Resultado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde tabular-nums">
              {t.meses.map((m, i) => (
                <tr key={m}>
                  <td className={TD}>{mesCorto(m)}</td>
                  <td className={cn(TD, 'text-right')}>{din(tv.ingresos[i] ?? 0)}</td>
                  <td className={cn(TD, 'text-right')}>{din(tv.costos[i] ?? 0)}</td>
                  <td className={cn(TD, 'text-right')}>{din(tv.gastos[i] ?? 0)}</td>
                  <td className={cn(TD, 'text-right font-medium', (tv.resultado[i] ?? 0) < 0 && 'text-error')}>{din(tv.resultado[i] ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

/**
 * Las cuatro tarjetas de números del resumen: plata en bancos, lo por cobrar, lo por pagar y
 * el resultado del mes. Sprint 4: se muestran también en «Hoy» de Finanzas y Gerencia.
 */
export function IndicadoresFinanzas({ t, moneda = 'CLP' }: { t: Tablero; moneda?: MonedaTablero }) {
  const din = (x: number) => dinero(x, moneda);
  const n = t.meses.length - 1;
  const resMes = t.resultado[n] ?? 0;
  const resAnt = t.resultado[n - 1] ?? 0;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Indicador titulo="Plata en bancos y cajas" valor={din(t.disponibleClp)} detalle={`${t.bancos.length} cuentas, en ${moneda === 'USD' ? 'dólares' : 'pesos'} de hoy`} href="/conciliacion" />
      <Indicador
        titulo="Por cobrar (clientes)"
        valor={din(t.porCobrarClp)}
        detalle={t.facturasVencidas > 0 ? `${din(t.porCobrarVencidoClp)} vencido en ${t.facturasVencidas} facturas` : 'nada vencido'}
        tono={t.facturasVencidas > 0 ? 'error' : 'normal'}
        href="/analisis/cobros-pagos"
      />
      {/* 20/11/2026 (plan de simplificación, cambio 2): son las facturas; el total de lo que se debe es la cuenta de proveedores */}
      <Indicador
        titulo="Facturas por pagar"
        valor={din(t.porPagarClp)}
        detalle={
          t.gastosVencidos > 0
            ? `${din(t.porPagarVencidoClp)} vencido en ${t.gastosVencidos === 1 ? 'una factura' : `${t.gastosVencidos} facturas`}`
            : `${din(t.porPagar7DiasClp)} vence en los próximos 7 días`
        }
        tono={t.gastosVencidos > 0 ? 'error' : 'normal'}
        href="/analisis/cobros-pagos?ver=pagar&facturas=1"
      />
      <Indicador
        titulo={`Resultado de ${t.meses[n] ? mesCorto(t.meses[n]) : 'este mes'}`}
        valor={din(resMes)}
        detalle={`${mesCorto(t.meses[n - 1] ?? t.hoy)}: ${din(resAnt)}`}
        tono={resMes < 0 ? 'alerta' : 'normal'}
        href="/analisis/informes"
      />
    </div>
  );
}

/** Sprint 4: las tarjetas de números para «Hoy», con su propia lectura del resumen. */
export function TarjetasFinanzas() {
  const { data: t, isLoading, isError, error, refetch } = useTableroFinanzas();
  if (isLoading) return <Cargando texto="Leyendo los números…" />;
  if (isError || !t) return <ErrorLectura texto="No se pudo leer el tablero financiero." onReintentar={() => void refetch()} error={error} />;
  return <IndicadoresFinanzas t={t} />;
}

/** Migración 372 · Pesos chilenos o dólares (al dólar de hoy los saldos; al promedio de cada mes los meses). */
function ElegirMoneda({ moneda, onCambiar, t }: { moneda: MonedaTablero; onCambiar: (m: MonedaTablero) => void; t: Tablero }) {
  const hay = !!t.tcUsd && t.tcUsd > 0;
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="inline-flex rounded-lg border border-borde bg-panel p-0.5 text-sm" role="group" aria-label="Moneda del tablero">
        {(['CLP', 'USD'] as const).map((x) => (
          <button
            key={x}
            type="button"
            disabled={x === 'USD' && !hay}
            aria-pressed={moneda === x}
            onClick={() => onCambiar(x)}
            className={cn('rounded-md px-3 py-1 font-medium', moneda === x ? 'bg-marca text-white' : 'text-tinta-suave hover:bg-hover disabled:opacity-50')}
          >
            {x === 'CLP' ? 'Pesos (CLP)' : 'Dólares (USD)'}
          </button>
        ))}
      </div>
      <p className="text-xs text-tinta-suave">
        {hay
          ? moneda === 'USD'
            ? `Dólar de hoy ${dinero(t.tcUsd ?? 0)}${t.tcUsdFecha ? ` (${fecha(t.tcUsdFecha)})` : ''}; cada mes, con el dólar promedio del mes`
            : `Dólar de hoy ${dinero(t.tcUsd ?? 0)}`
          : 'Sin dólar cargado: cargalo en Monedas y tipos de cambio'}
      </p>
    </div>
  );
}
