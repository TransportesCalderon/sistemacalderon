'use client';

import { useState } from 'react';
import { LoaderCircle, Package, Plus, Undo2 } from 'lucide-react';
import { useEnvio } from '@/modules/catalogos/components/comun';
import { ErrorBase, ErrorLectura } from '@/modules/combustible/components/comun/ui';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { useSesion } from '@/modules/core/session/session-provider';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, CONTROL_FILTRO } from '@/shared/ui/clases';
import { cant, decimalLocal, pesos, stockEn } from '../../domain/stock.types';
import { useConsumirInsumo, useDevolverInsumo, useInsumosOt, useStockInsumos } from '../../queries/hooks';

/**
 * Migración 216 · Insumos usados en una orden de trabajo: salen del pañol al costo promedio y van a
 * «Mantenimiento y repuestos» (con el camión, si es un tractor). Lo que sobra se devuelve al mismo costo.
 */
export function InsumosOt({ ot, puedeCargar }: { ot: number; puedeCargar: boolean }) {
  const { zonaHoraria } = useSesion();
  const { data, isPending, isError, error, refetch } = useInsumosOt(ot, true);
  const [agregar, setAgregar] = useState(false);
  const [devolver, setDevolver] = useState<number | null>(null);
  if (isPending) return <p className="text-xs text-tinta-suave">Leyendo los insumos…</p>;
  if (isError) return <ErrorLectura texto="No se pudieron leer los insumos de la orden." error={error} onReintentar={() => void refetch()} />;
  if (data.consumos.length === 0 && !puedeCargar) return null;

  return (
    <section className="space-y-2 border-t border-borde pt-3" aria-label="Insumos usados">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-1 text-sm font-semibold text-tinta">
          <Package className="size-4" /> Insumos del stock
        </h3>
        {data.costo > 0 && <span className="text-sm tabular-nums text-tinta-suave">· costo {pesos(data.costo)}</span>}
        {puedeCargar && !agregar && (
          <button type="button" className={cn(BOTON_SECUNDARIO, 'ml-auto')} onClick={() => setAgregar(true)}>
            <Plus className="size-4" /> Agregar insumo
          </button>
        )}
      </div>
      {data.consumos.length > 0 && (
        <ul className="divide-y divide-borde text-sm">
          {data.consumos.map((c) => {
            const neto = c.cantidad - c.devuelto;
            return (
              <li key={c.id} className="flex flex-wrap items-baseline gap-x-3 py-1.5">
                <span className="font-mono text-xs">{c.codigo}</span>
                <span>{c.insumo}</span>
                <span className="tabular-nums">
                  {cant(neto)} {c.unidad}
                  {c.devuelto > 0 && <span className="text-xs text-tinta-suave"> (devolvió {cant(c.devuelto)})</span>}
                </span>
                <span className="text-xs text-tinta-suave">
                  {c.panol} · {formatearFechaHora(c.fecha, zonaHoraria)}
                  {c.usuario ? ` · ${c.usuario}` : ''}
                </span>
                <span className="ml-auto tabular-nums">{pesos(Math.round(neto * c.costoUnitario))}</span>
                {puedeCargar && neto > 0 && (
                  <button type="button" className="text-xs text-marca hover:underline" onClick={() => setDevolver(devolver === c.id ? null : c.id)}>
                    <Undo2 className="mr-0.5 inline size-3.5" />
                    Devolver
                  </button>
                )}
                {devolver === c.id && <Devolver consumo={c.id} maximo={neto} onCerrar={() => setDevolver(null)} />}
              </li>
            );
          })}
        </ul>
      )}
      {agregar && <Agregar ot={ot} onCerrar={() => setAgregar(false)} />}
    </section>
  );
}

function Agregar({ ot, onCerrar }: { ot: number; onCerrar: () => void }) {
  const stock = useStockInsumos(true).data;
  const consumir = useConsumirInsumo();
  const envio = useEnvio();
  const [insumo, setInsumo] = useState('');
  const [panol, setPanol] = useState('');
  const [cantidad, setCantidad] = useState('');
  const conStock = (stock?.insumos ?? []).filter((i) => i.cantidad > 0);
  const sel = conStock.find((i) => String(i.id) === insumo);
  return (
    <div className="space-y-2 rounded-md border border-marca/40 bg-panel p-3">
      <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr]">
        <select
          aria-label="Insumo"
          className={cn(CONTROL_FILTRO, 'h-10')}
          value={insumo}
          onChange={(e) => {
            setInsumo(e.target.value);
            const i = conStock.find((x) => String(x.id) === e.target.value);
            const con = i?.porPanol.filter((p) => p.cantidad > 0) ?? [];
            setPanol(con.length === 1 ? String(con[0]?.panolId) : '');
          }}
        >
          <option value="">{stock ? (conStock.length ? 'Insumo…' : 'No hay insumos con stock') : 'Leyendo el stock…'}</option>
          {conStock.map((i) => (
            <option key={i.id} value={i.id}>
              {i.codigo} · {i.nombre} ({cant(i.cantidad)} {i.unidad})
            </option>
          ))}
        </select>
        <select aria-label="Pañol" className={cn(CONTROL_FILTRO, 'h-10')} value={panol} onChange={(e) => setPanol(e.target.value)}>
          <option value="">Pañol…</option>
          {(sel?.porPanol ?? [])
            .filter((p) => p.cantidad > 0)
            .map((p) => (
              <option key={p.panolId} value={p.panolId}>
                {p.panol} (hay {cant(p.cantidad)})
              </option>
            ))}
        </select>
        <input
          aria-label="Cantidad"
          className={cn(CONTROL_FILTRO, 'h-10')}
          inputMode="decimal"
          placeholder={`Cantidad${sel ? ` (${sel.unidad})` : ''}${sel && panol ? ` · máx ${cant(stockEn(sel, Number(panol)))}` : ''}`}
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
        />
      </div>
      <ErrorBase error={envio.error} />
      <div className="flex gap-2">
        <button
          type="button"
          className={BOTON_PRIMARIO}
          disabled={consumir.isPending}
          onClick={() =>
            void envio.enviar(
              consumir.mutateAsync({ ot, insumo: Number(insumo) || 0, panol: Number(panol) || 0, cantidad: decimalLocal(cantidad) ?? 0 }),
              onCerrar,
            )
          }
        >
          {consumir.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />} Usar en la orden
        </button>
        <button type="button" className={BOTON_SECUNDARIO} onClick={onCerrar}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

function Devolver({ consumo, maximo, onCerrar }: { consumo: number; maximo: number; onCerrar: () => void }) {
  const devolver = useDevolverInsumo();
  const envio = useEnvio();
  const [cantidad, setCantidad] = useState(cant(maximo));
  return (
    <div className="flex w-full flex-wrap items-center gap-2 pt-1">
      <input aria-label="Cantidad a devolver" className={cn(CONTROL_FILTRO, 'h-9 w-28')} inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
      <button
        type="button"
        className={BOTON_SECUNDARIO}
        disabled={devolver.isPending}
        onClick={() => void envio.enviar(devolver.mutateAsync({ consumo, cantidad: decimalLocal(cantidad) ?? 0 }), onCerrar)}
      >
        <Undo2 className="size-4" /> Devolver al pañol
      </button>
      <ErrorBase error={envio.error} />
    </div>
  );
}
