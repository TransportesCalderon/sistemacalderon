'use client';

import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { TD, TH } from '@/modules/catalogos/components/comun';
import { Cargando, ErrorLectura, Seccion } from '@/modules/combustible/components/comun/ui';
import { cn } from '@/shared/lib/cn';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { formatearNumero } from '@/shared/lib/numeros';
import { dinero, type CuentaEstacion } from '../domain/finanzas.types';
import { useCargasPorFacturar, useCuentaEstaciones } from '../queries/hooks';
import { fecha, SeccionPlegada } from './comun';

/**
 * Migración 274 · Debemos › Cuenta corriente con estaciones: por proveedor de combustible (y moneda), las cargas en
 * cuenta corriente o con tarjeta que todavía no tienen factura y las facturas que todavía no se pagaron.
 * 20/11/2026 (plan de simplificación, cambio 2): con la cuenta de proveedores arriba (migración 281), esto queda como
 * «Detalle por estación», plegado y sin total (plegado); se abre solo si se llega con ?estaciones=1 (abierta).
 */
export function CuentaEstaciones({ plegado = false, abierta = false }: { plegado?: boolean; abierta?: boolean }) {
  // Llega con la migración 274: antes de aplicarla en la base, no se muestra (en vez de un error)
  const hay = useBaseTiene(274);
  if (!hay) return null;
  return <CuentaEstacionesLista plegado={plegado} abierta={abierta} />;
}

function CuentaEstacionesLista({ plegado, abierta }: { plegado: boolean; abierta: boolean }) {
  const { data, isLoading, isError, error, refetch } = useCuentaEstaciones();
  const [abierto, setAbierto] = useState<string | null>(null);
  if (isLoading) return <Cargando texto="Buscando lo que se debe a las estaciones…" />;
  if (isError || !data) return <ErrorLectura texto="No se pudo leer la cuenta corriente con las estaciones." onReintentar={() => void refetch()} error={error} />;
  if (data.length === 0) return null;
  const totales = Object.entries(
    data.reduce<Record<string, number>>((t, x) => ({ ...t, [x.moneda]: (t[x.moneda] ?? 0) + x.total }), {}),
  ).map(([m, v]) => dinero(v, m));
  const explicacion = (
    <p className="mb-3 text-sm text-tinta-suave">
      Cargas en cuenta corriente o con tarjeta que todavía no tienen factura, y facturas de cada proveedor que todavía no se pagaron.
    </p>
  );
  const tabla = (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="border-y border-borde bg-fondo">
          <tr>
            <th className={TH}>Proveedor y estaciones</th>
            <th className={cn(TH, 'text-right')}>Cargas sin factura</th>
            <th className={cn(TH, 'text-right')}>Facturas sin pagar</th>
            <th className={cn(TH, 'text-right')}>Cargas + facturas</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-borde">
          {data.map((x) => {
            const clave = `${x.proveedorId}-${x.moneda}`;
            return (
              <Fragment key={clave}>
                <FilaEstacion x={x} abierta={abierto === clave} onAbrir={() => setAbierto(abierto === clave ? null : clave)} />
                {abierto === clave && (
                  <tr>
                    <td colSpan={4} className="bg-fondo px-3 py-2">
                      <CargasSinFactura proveedorId={x.proveedorId} moneda={x.moneda} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
  if (plegado)
    return (
      <SeccionPlegada titulo="Detalle por estación" abierta={abierta}>
        {explicacion}
        {tabla}
      </SeccionPlegada>
    );
  return (
    <Seccion titulo={`Cuenta corriente con estaciones · ${totales.join(' · ')}`}>
      {explicacion}
      {tabla}
    </Seccion>
  );
}

function FilaEstacion({ x, abierta, onAbrir }: { x: CuentaEstacion; abierta: boolean; onAbrir: () => void }) {
  return (
    <tr>
      <td className={TD}>
        <button type="button" className="flex items-start gap-1 text-left text-marca hover:underline" onClick={onAbrir} disabled={x.cargas === 0}>
          {x.cargas > 0 && (abierta ? <ChevronDown className="mt-0.5 size-4 shrink-0" /> : <ChevronRight className="mt-0.5 size-4 shrink-0" />)}
          <span>{x.proveedor}</span>
        </button>
        {x.estaciones && <span className="block text-xs text-tinta-suave">{x.estaciones}</span>}
      </td>
      <td className={cn(TD, 'text-right tabular-nums')}>
        {x.cargas > 0 ? dinero(x.cargasImporte, x.moneda) : '—'}
        {x.cargas > 0 && (
          <span className="block text-xs text-tinta-suave">
            {x.cargas} {x.cargas === 1 ? 'carga' : 'cargas'} · {formatearNumero(x.litros, 0)} L
            {x.desde && ` · ${x.desde === x.hasta ? fecha(x.desde) : `${fecha(x.desde)} a ${fecha(x.hasta)}`}`}
          </span>
        )}
        {x.cargasSinImporte > 0 && <span className="block text-xs text-alerta">{x.cargasSinImporte} sin importe cargado</span>}
      </td>
      <td className={cn(TD, 'text-right tabular-nums')}>
        {x.facturas > 0 ? dinero(x.facturasSaldo, x.moneda) : '—'}
        {x.facturas > 0 && (
          <span className={cn('block text-xs', x.vencido > 0 ? 'text-error' : 'text-tinta-suave')}>
            {x.facturas} {x.facturas === 1 ? 'factura' : 'facturas'}
            {x.vencido > 0 && ` · vencido ${dinero(x.vencido, x.moneda)}`}
          </span>
        )}
      </td>
      <td className={cn(TD, 'text-right font-medium tabular-nums')}>{dinero(x.total, x.moneda)}</td>
    </tr>
  );
}

function CargasSinFactura({ proveedorId, moneda }: { proveedorId: number; moneda: string }) {
  const { data, isLoading } = useCargasPorFacturar(proveedorId, null);
  if (isLoading) return <Cargando texto="Buscando las cargas…" />;
  const cargas = (data ?? []).filter((c) => c.moneda === moneda);
  if (cargas.length === 0) return <p className="text-sm text-tinta-suave">No hay cargas sin factura.</p>;
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-tinta-suave">
          <th className="px-2 py-1 text-left font-medium">Fecha</th>
          <th className="px-2 py-1 text-left font-medium">Camión</th>
          <th className="px-2 py-1 text-left font-medium">Estación</th>
          <th className="px-2 py-1 text-left font-medium">Guía o remito</th>
          <th className="px-2 py-1 text-right font-medium">Litros</th>
          <th className="px-2 py-1 text-right font-medium">Importe</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-borde">
        {cargas.map((c) => (
          <tr key={c.id}>
            <td className="px-2 py-1 tabular-nums">{fecha(c.fecha)}</td>
            <td className="px-2 py-1 font-mono">{c.camion ?? '—'}</td>
            <td className="px-2 py-1">{c.estacion ?? '—'}</td>
            <td className="px-2 py-1">{c.guia ?? '—'}</td>
            <td className="px-2 py-1 text-right tabular-nums">{formatearNumero(c.litros, 0)}</td>
            <td className="px-2 py-1 text-right tabular-nums">{dinero(c.importe, c.moneda)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
