'use client';

import { useState } from 'react';
import { ArrowLeft, Download, Wallet } from 'lucide-react';
import { TD, TH } from '@/modules/catalogos/components/comun';
import { Cargando, ErrorLectura, Vacio } from '@/modules/combustible/components/comun/ui';
import { cn } from '@/shared/lib/cn';
import { formatearFechaDia } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import { cuentaACsv, type CuentaCorriente, type CuentaMoneda } from '../domain/cuenta-corriente';
import { useCuentaCorriente, useSaldosClientes } from '../queries/hooks';

const plata = (n: number) => formatearNumero(n, 2);
const NUM = 'text-right font-mono tabular-nums whitespace-nowrap';

/**
 * Cuenta corriente de clientes: primero los saldos de todos; al tocar un cliente, sus movimientos (factura, cobro,
 * anulación) con saldo corrido, saldo anterior y la deuda por antigüedad. Solo lectura: los números los calcula la base.
 */
export function CuentaCorrienteVista({ onAbrirFactura }: { onAbrirFactura: (id: number) => void }) {
  const [cliente, setCliente] = useState<number | null>(null);
  return cliente === null ? <Saldos onElegir={setCliente} /> : <Cuenta clienteId={cliente} onVolver={() => setCliente(null)} onAbrirFactura={onAbrirFactura} />;
}

function Saldos({ onElegir }: { onElegir: (id: number) => void }) {
  const { data, isLoading, isError, error, refetch } = useSaldosClientes();
  const [soloDeuda, setSoloDeuda] = useState(true);
  if (isLoading) return <Cargando texto="Sumando las cuentas de los clientes…" />;
  if (isError || !data) return <ErrorLectura texto="No se pudo leer la cuenta corriente." onReintentar={() => void refetch()} error={error} />;
  if (data.length === 0) return <Vacio icono={<Wallet className="size-6" />} texto="Todavía no hay facturas emitidas." />;
  const filas = soloDeuda ? data.filter((c) => Math.abs(c.saldo) >= 0.01) : data;
  const monedas = [...new Set(data.map((c) => c.moneda))].sort();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {monedas.map((m) => {
          const de = data.filter((c) => c.moneda === m);
          return (
            <div key={m} className={cn(TARJETA, 'px-4 py-3')}>
              <p className="text-xs text-tinta-suave">Nos deben en {m}</p>
              <p className="text-xl font-semibold text-tinta">{plata(de.reduce((t, c) => t + c.saldo, 0))}</p>
              <p className="text-xs text-error">Vencido: {plata(de.reduce((t, c) => t + c.vencido, 0))}</p>
            </div>
          );
        })}
      </div>
      <label className="flex items-center gap-2 text-sm text-tinta">
        <input type="checkbox" checked={soloDeuda} onChange={(e) => setSoloDeuda(e.target.checked)} /> Solo los clientes con saldo
      </label>
      <div className={cn(TARJETA, 'overflow-x-auto')}>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className={TH}>Cliente</th>
              <th className={TH}>Moneda</th>
              <th className={cn(TH, 'text-right')}>Facturado</th>
              <th className={cn(TH, 'text-right')}>Cobrado</th>
              <th className={cn(TH, 'text-right')}>Saldo</th>
              <th className={cn(TH, 'text-right')}>Vencido</th>
              <th className={TH}>Facturas sin cobrar</th>
              <th className={TH}>Último cobro</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((c) => (
              <tr key={`${c.clienteId}-${c.moneda}`} className="cursor-pointer hover:bg-hover/60" onClick={() => onElegir(c.clienteId)}>
                <td className={cn(TD, 'font-medium text-marca')}>{c.cliente}</td>
                <td className={TD}>{c.moneda}</td>
                <td className={cn(TD, NUM)}>{plata(c.facturado)}</td>
                <td className={cn(TD, NUM)}>{plata(c.cobrado)}</td>
                <td className={cn(TD, NUM, 'font-semibold')}>{plata(c.saldo)}</td>
                <td className={cn(TD, NUM, c.vencido > 0 && 'font-semibold text-error')}>{plata(c.vencido)}</td>
                <td className={TD}>
                  {c.facturasAbiertas}
                  {c.venceLaMasVieja && <span className="text-xs text-tinta-suave"> · la más vieja vence {formatearFechaDia(c.venceLaMasVieja)}</span>}
                </td>
                <td className={TD}>{c.ultimoCobro ? formatearFechaDia(c.ultimoCobro) : '—'}</td>
              </tr>
            ))}
            {filas.length === 0 && (
              <tr>
                <td className={cn(TD, 'text-tinta-suave')} colSpan={8}>
                  Ningún cliente debe nada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-tinta-suave">Tocá un cliente para ver sus movimientos. Entran las facturas emitidas; las prefacturas y lo que falta facturar no.</p>
    </div>
  );
}

function bajar(c: CuentaCorriente) {
  const url = URL.createObjectURL(new Blob(['\uFEFF' + cuentaACsv(c)], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `cuenta-corriente-${c.cliente.nombre.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}-${c.hasta}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** La cuenta de un cliente para usar fuera de Facturación (ficha del cliente): cada documento abre la factura en Facturación. */
export function CuentaDeCliente({ clienteId }: { clienteId: number }) {
  return <Cuenta clienteId={clienteId} onAbrirFactura={(id) => window.location.assign(`/ventas/facturacion?factura=${id}`)} />;
}

function Cuenta({ clienteId, onVolver, onAbrirFactura }: { clienteId: number; onVolver?: () => void; onAbrirFactura: (id: number) => void }) {
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const { data, isLoading, isError, error, refetch } = useCuentaCorriente(clienteId, desde || null, hasta || null);
  if (isLoading) return <Cargando texto="Leyendo la cuenta del cliente…" />;
  if (isError || !data) return <ErrorLectura texto="No se pudo leer la cuenta del cliente." onReintentar={() => void refetch()} error={error} />;
  const campo = 'h-9 rounded-md border border-borde bg-panel px-2 text-sm';
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        {onVolver && (
          <button type="button" className={BOTON_SECUNDARIO} onClick={onVolver}>
            <ArrowLeft className="size-4" /> Todos los clientes
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-tinta">{data.cliente.razonSocial}</h2>
          <p className="text-xs text-tinta-suave">
            Del {formatearFechaDia(data.desde)} al {formatearFechaDia(data.hasta)}
            {data.cliente.plazoDias !== null && ` · plazo de pago cargado: ${data.cliente.plazoDias} días`}
          </p>
        </div>
        <label className="text-xs text-tinta-suave">
          Desde
          <input type="date" className={cn(campo, 'ml-1')} value={desde || data.desde} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label className="text-xs text-tinta-suave">
          Hasta
          <input type="date" className={cn(campo, 'ml-1')} value={hasta || data.hasta} onChange={(e) => setHasta(e.target.value)} />
        </label>
        <button type="button" className={BOTON_SECUNDARIO} onClick={() => bajar(data)}>
          <Download className="size-4" /> Bajar planilla
        </button>
      </div>
      {data.monedas.length === 0 && <Vacio icono={<Wallet className="size-6" />} texto="Este cliente no tiene facturas emitidas." />}
      {data.monedas.map((m) => (
        <Moneda key={m.moneda} m={m} desde={data.desde} onAbrirFactura={onAbrirFactura} />
      ))}
    </div>
  );
}

function Moneda({ m, desde, onAbrirFactura }: { m: CuentaMoneda; desde: string; onAbrirFactura: (id: number) => void }) {
  const cajas: [string, number, boolean][] = [
    ['Saldo hoy', m.saldoHoy, false],
    ['Por vencer', m.porVencer, false],
    ['Vencido 1 a 30 días', m.vencido30, m.vencido30 > 0],
    ['Vencido 31 a 60 días', m.vencido60, m.vencido60 > 0],
    ['Vencido más de 60 días', m.vencidoMas60, m.vencidoMas60 > 0],
  ];
  return (
    <section className={cn(TARJETA, 'space-y-3 p-4')}>
      <h3 className="font-semibold text-tinta">Cuenta en {m.moneda}</h3>
      <div className="flex flex-wrap gap-x-8 gap-y-2">
        {cajas.map(([t, v, rojo]) => (
          <div key={t}>
            <p className="text-xs text-tinta-suave">{t}</p>
            <p className={cn('text-base font-semibold', rojo ? 'text-error' : 'text-tinta')}>{plata(v)}</p>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className={TH}>Fecha</th>
              <th className={TH}>Documento</th>
              <th className={TH}>Detalle</th>
              <th className={TH}>Vence</th>
              <th className={cn(TH, 'text-right')}>Debe</th>
              <th className={cn(TH, 'text-right')}>Haber</th>
              <th className={cn(TH, 'text-right')}>Saldo</th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-fondo/40">
              <td className={TD}>{formatearFechaDia(desde)}</td>
              <td className={cn(TD, 'font-medium')} colSpan={5}>
                Saldo anterior
              </td>
              <td className={cn(TD, NUM, 'font-semibold')}>{plata(m.saldoAnterior)}</td>
            </tr>
            {m.movimientos.map((x, i) => (
              <tr key={i}>
                <td className={cn(TD, 'whitespace-nowrap')}>{formatearFechaDia(x.fecha)}</td>
                <td className={TD}>
                  {x.facturaId !== null ? (
                    <button type="button" className="font-medium text-marca hover:underline" onClick={() => onAbrirFactura(x.facturaId!)}>
                      {x.documento}
                    </button>
                  ) : (
                    x.documento
                  )}
                </td>
                <td className={cn(TD, 'text-tinta-suave')}>{x.detalle ?? ''}</td>
                <td className={cn(TD, 'whitespace-nowrap')}>{x.vence ? formatearFechaDia(x.vence) : ''}</td>
                <td className={cn(TD, NUM)}>{x.debe ? plata(x.debe) : ''}</td>
                <td className={cn(TD, NUM)}>{x.haber ? plata(x.haber) : ''}</td>
                <td className={cn(TD, NUM, 'font-semibold')}>{plata(x.saldo)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-borde">
              <td className={cn(TD, 'font-semibold')} colSpan={4}>
                Total del período
              </td>
              <td className={cn(TD, NUM, 'font-semibold')}>{plata(m.facturado)}</td>
              <td className={cn(TD, NUM, 'font-semibold')}>{plata(m.cobrado)}</td>
              <td className={cn(TD, NUM, 'font-semibold')}>{plata(m.saldo)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
