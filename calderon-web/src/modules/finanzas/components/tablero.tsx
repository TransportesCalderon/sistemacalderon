'use client';

import Link from 'next/link';
import { Cargando, Encabezado, ErrorLectura, Seccion } from '@/modules/combustible/components/comun/ui';
import { TD, TH } from '@/modules/catalogos/components/comun';
import { cn } from '@/shared/lib/cn';
import { dinero, mesCorto } from '../domain/finanzas.types';
import { useTableroFinanzas } from '../queries/hooks';
import { Aviso, Indicador } from './comun';
import { GraficoIngresosGastos, GraficoPrincipales, GraficoResultado } from './graficos';

/** Finanzas › Resumen: plata disponible, lo que nos deben y lo que debemos, y cómo vienen los meses. */
export function TableroFinanzas() {
  const { data: t, isLoading, isError, error, refetch } = useTableroFinanzas();
  if (isLoading) return <Cargando texto="Armando el resumen…" />;
  if (isError || !t) return <ErrorLectura texto="No se pudo leer el resumen financiero." onReintentar={() => void refetch()} error={error} />;

  const egresos = t.costos.map((c, i) => c + (t.gastos[i] ?? 0));
  const n = t.meses.length - 1;
  const resMes = t.resultado[n] ?? 0;
  const resAnt = t.resultado[n - 1] ?? 0;
  const sinDatos = t.bancos.length === 0 && t.ingresos.every((v) => v === 0) && egresos.every((v) => v === 0);

  return (
    <div className="space-y-5">
      <Encabezado titulo="Resumen financiero" subtitulo="Finanzas" />

      {sinDatos && (
        <Aviso>
          Para empezar: cargá tus cuentas en{' '}
          <Link href="/finanzas/bancos" className="font-medium underline">
            Bancos y cajas
          </Link>{' '}
          (con el saldo de hoy), los gastos que se repiten en{' '}
          <Link href="/finanzas/gastos-fijos" className="font-medium underline">
            Gastos fijos
          </Link>{' '}
          y los gastos del mes en{' '}
          <Link href="/finanzas/gastos" className="font-medium underline">
            Gastos
          </Link>
          .
        </Aviso>
      )}
      {t.fijosSinGenerar > 0 && (
        <Aviso>
          Faltan generar {t.fijosSinGenerar === 1 ? '1 gasto fijo' : `${t.fijosSinGenerar} gastos fijos`} de este mes.{' '}
          <Link href="/finanzas/gastos-fijos" className="font-medium underline">
            Generarlos
          </Link>
        </Aviso>
      )}
      {t.porConciliar > 0 && (
        <Aviso>
          Hay {t.porConciliar} {t.porConciliar === 1 ? 'línea' : 'líneas'} de la cartola sin conciliar.{' '}
          <Link href="/finanzas/bancos" className="font-medium underline">
            Conciliar
          </Link>
        </Aviso>
      )}
      {t.facturasSinAsiento > 0 && (
        <Aviso>
          {t.facturasSinAsiento === 1 ? 'Una factura emitida no tiene' : `${t.facturasSinAsiento} facturas emitidas no tienen`} asiento porque falta el tipo de cambio del día.
          Cargalo en{' '}
          <Link href="/finanzas/tipos-cambio" className="font-medium underline">
            Monedas y tipos de cambio
          </Link>{' '}
          y después tocá «Rehacer asientos» en el Plan de cuentas.
        </Aviso>
      )}
      {t.pendientesContables > 0 && (
        <Aviso>
          {t.pendientesContables === 1 ? 'Un documento no entró' : `${t.pendientesContables} documentos no entraron`} a la contabilidad.{' '}
          <Link href="/finanzas/plan-cuentas" className="font-medium underline">
            Ver por qué
          </Link>
        </Aviso>
      )}
      {t.cobrosSinCuentaClp !== 0 && (
        <Aviso>
          Hay {dinero(t.cobrosSinCuentaClp)} de facturas cobradas sin decir a qué banco entraron.{' '}
          <Link href="/finanzas/cobros-pagos" className="font-medium underline">
            Decir el banco
          </Link>
        </Aviso>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador titulo="Plata en bancos y cajas" valor={dinero(t.disponibleClp)} detalle={`${t.bancos.length} cuentas, en pesos de hoy`} href="/finanzas/bancos" />
        <Indicador
          titulo="Nos deben (clientes)"
          valor={dinero(t.porCobrarClp)}
          detalle={t.facturasVencidas > 0 ? `${dinero(t.porCobrarVencidoClp)} vencido en ${t.facturasVencidas} facturas` : 'nada vencido'}
          tono={t.facturasVencidas > 0 ? 'error' : 'normal'}
          href="/finanzas/cobros-pagos"
        />
        <Indicador
          titulo="Debemos (proveedores)"
          valor={dinero(t.porPagarClp)}
          detalle={
            t.gastosVencidos > 0
              ? `${dinero(t.porPagarVencidoClp)} vencido en ${t.gastosVencidos} gastos`
              : `${dinero(t.porPagar7DiasClp)} vence en los próximos 7 días`
          }
          tono={t.gastosVencidos > 0 ? 'error' : 'normal'}
          href="/finanzas/cobros-pagos?ver=pagar"
        />
        <Indicador
          titulo={`Resultado de ${t.meses[n] ? mesCorto(t.meses[n]) : 'este mes'}`}
          valor={dinero(resMes)}
          detalle={`${mesCorto(t.meses[n - 1] ?? t.hoy)}: ${dinero(resAnt)}`}
          tono={resMes < 0 ? 'alerta' : 'normal'}
          href="/finanzas/informes"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador
          titulo="Fletes entregados sin facturar"
          valor={dinero(t.fletesPorFacturarClp)}
          detalle="ya son ingreso; falta emitir la factura"
          href="/finanzas/informes"
        />
        <Indicador
          titulo="Combustible sin factura del proveedor"
          valor={dinero(t.combustiblePorFacturarClp)}
          detalle="cargas en cuenta corriente o tarjeta"
          href="/finanzas/combustible"
        />
        <Indicador titulo="Fondos de choferes por rendir" valor={dinero(t.fondosChoferesClp)} detalle="plata entregada que falta rendir" href="/rrhh/fondos" />
        <Indicador titulo="Sueldos y leyes sociales por pagar" valor={dinero(t.sueldosPorPagarClp)} detalle="liquidaciones aprobadas sin pagar" href="/rrhh/liquidaciones" />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Seccion titulo="Ingresos y gastos de los últimos 12 meses">
          <GraficoIngresosGastos meses={t.meses} ingresos={t.ingresos} egresos={egresos} />
        </Seccion>
        <Seccion titulo="Resultado de cada mes">
          <GraficoResultado meses={t.meses} resultado={t.resultado} />
        </Seccion>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Seccion titulo="En qué se fue la plata este mes">
          {t.principalesGastos.length === 0 ? (
            <p className="text-sm text-tinta-suave">Todavía no hay gastos cargados este mes.</p>
          ) : (
            <GraficoPrincipales items={t.principalesGastos} />
          )}
        </Seccion>
        <Seccion titulo="Saldos por cuenta">
          {t.bancos.length === 0 ? (
            <p className="text-sm text-tinta-suave">Todavía no hay bancos ni cajas.</p>
          ) : (
            <ul className="divide-y divide-borde text-sm">
              {t.bancos.map((b) => (
                <li key={b.nombre} className="flex items-baseline justify-between gap-3 py-2">
                  <span className="text-tinta">{b.nombre}</span>
                  <span className="text-right tabular-nums">
                    <span className={cn('font-medium', b.saldo < 0 ? 'text-error' : 'text-tinta')}>{dinero(b.saldo, b.moneda)}</span>
                    {b.moneda !== 'CLP' && <span className="block text-xs text-tinta-suave">≈ {dinero(b.saldoClp)}</span>}
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
                  <td className={cn(TD, 'text-right')}>{dinero(t.ingresos[i] ?? 0)}</td>
                  <td className={cn(TD, 'text-right')}>{dinero(t.costos[i] ?? 0)}</td>
                  <td className={cn(TD, 'text-right')}>{dinero(t.gastos[i] ?? 0)}</td>
                  <td className={cn(TD, 'text-right font-medium', (t.resultado[i] ?? 0) < 0 && 'text-error')}>{dinero(t.resultado[i] ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
