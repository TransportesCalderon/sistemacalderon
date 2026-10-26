'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { FilePlus2, LoaderCircle, Plus, Receipt, Save, Trash2, X } from 'lucide-react';
import { TD, TH, useEnvio } from '@/modules/catalogos/components/comun';
import { AccionConMotivo, Cargando, Encabezado, ErrorBase, ErrorLectura, Vacio } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { formatearFechaDia, hoyEnZona } from '@/shared/lib/fechas';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { ETIQUETA_ESTADO_FAC, ETIQUETA_UNIDAD, usd, type EstadoFactura, type PorFacturar } from '../domain/ventas.types';
import { useCuentasParaElegir } from '@/modules/finanzas/queries/hooks';
import { useAnularFactura, useCobrarFactura, useCrearFactura, useEmitirFactura, useFactura, useFacturas, useGuardarFactura, usePorFacturar } from '../queries/hooks';
import { ChipFactura } from './comun';

const FILTROS: (EstadoFactura | null)[] = ['borrador', 'emitida', 'vencida', 'cobrada', 'anulada', null];

/** Ventas › Facturación: lo entregado sin facturar, las prefacturas, lo emitido y lo cobrado. */
export function FacturacionPantalla() {
  const params = useSearchParams();
  const inicial = Number(params.get('factura')) || null;
  const [vista, setVista] = useState<'por_facturar' | 'facturas'>(inicial ? 'facturas' : 'por_facturar');
  const [abierta, setAbierta] = useState<number | null>(inicial);
  return (
    <div className="space-y-4">
      <Encabezado titulo="Facturación" subtitulo="Ventas" />
      <p className="text-sm text-tinta-suave">
        El sistema arma la prefactura con lo entregado y el precio de la tarifa. La factura electrónica se hace en el sistema de facturación de siempre;
        acá se anota su número, el vencimiento y el cobro.
      </p>
      <div className="flex gap-1 border-b border-borde">
        {(
          [
            ['por_facturar', 'Por facturar'],
            ['facturas', 'Prefacturas y facturas'],
          ] as const
        ).map(([id, t]) => (
          <button
            key={id}
            type="button"
            onClick={() => setVista(id)}
            className={cn('-mb-px border-b-2 px-3 py-2 text-sm', vista === id ? 'border-marca font-medium text-marca' : 'border-transparent text-tinta-suave')}
          >
            {t}
          </button>
        ))}
      </div>
      {vista === 'por_facturar' ? (
        <PorFacturarVista
          onCreada={(id) => {
            setAbierta(id);
            setVista('facturas');
          }}
        />
      ) : (
        <FacturasVista abierta={abierta} onAbrir={setAbierta} />
      )}
    </div>
  );
}

function PorFacturarVista({ onCreada }: { onCreada: (id: number) => void }) {
  const { data, isLoading, isError, error, refetch } = usePorFacturar();
  const puede = useCan('ventas.facturacion:editar');
  const crear = useCrearFactura();
  const envio = useEnvio();
  const [marcadas, setMarcadas] = useState<Set<number>>(new Set());
  const grupos = useMemo(() => {
    const m = new Map<number, { cliente: string; ops: PorFacturar[] }>();
    for (const o of data ?? []) {
      const g = m.get(o.clienteId) ?? { cliente: o.cliente, ops: [] };
      g.ops.push(o);
      m.set(o.clienteId, g);
    }
    return [...m.entries()];
  }, [data]);
  useEffect(() => setMarcadas(new Set((data ?? []).map((o) => o.servicioId))), [data]);

  if (isLoading) return <Cargando texto="Buscando lo entregado sin facturar…" />;
  if (isError || !data) return <ErrorLectura texto="No se pudo leer lo pendiente de facturar." onReintentar={() => void refetch()} error={error} />;
  if (data.length === 0) return <Vacio icono={<Receipt className="size-6" />} texto="No hay operaciones entregadas sin facturar." />;
  const alternar = (id: number) =>
    setMarcadas((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  return (
    <div className="space-y-4">
      <ErrorBase error={envio.error} />
      {grupos.map(([clienteId, g]) => {
        const elegidas = g.ops.filter((o) => marcadas.has(o.servicioId));
        const total = elegidas.reduce((t, o) => t + (o.precio.importe ?? 0), 0);
        return (
          <section key={clienteId} className={cn(TARJETA, 'space-y-2 p-4')}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold text-tinta">
                {g.cliente} <span className="text-sm font-normal text-tinta-suave">({g.ops.length})</span>
              </h2>
              {puede && (
                <button
                  type="button"
                  className={BOTON_PRIMARIO}
                  disabled={crear.isPending || elegidas.length === 0}
                  onClick={async () => {
                    envio.setError(null);
                    const r = await crear.mutateAsync({ clienteId, servicios: elegidas.map((o) => o.servicioId) });
                    if (!r.ok) return envio.setError(r.error);
                    onCreada(r.data);
                  }}
                >
                  {crear.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <FilePlus2 className="size-4" />} Armar prefactura ({elegidas.length} ·{' '}
                  {usd(total)})
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-borde">
                    <th className={cn(TH, 'w-8')} />
                    <th className={TH}>Operación</th>
                    <th className={TH}>Entregada</th>
                    <th className={TH}>Ruta</th>
                    <th className={cn(TH, 'text-right')}>Precio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borde">
                  {g.ops.map((o) => (
                    <tr key={o.servicioId}>
                      <td className={TD}>
                        <input
                          type="checkbox"
                          className="size-4 accent-marca"
                          checked={marcadas.has(o.servicioId)}
                          onChange={() => alternar(o.servicioId)}
                          aria-label={`Marcar operación ${o.numeroOperacion}`}
                        />
                      </td>
                      <td className={TD}>
                        N° {o.numeroOperacion}
                        <span className="block text-xs text-tinta-suave">{[o.contenedor, o.referenciaCliente && `ref. ${o.referenciaCliente}`].filter(Boolean).join(' · ')}</span>
                      </td>
                      <td className={cn(TD, 'tabular-nums')}>{formatearFechaDia(o.fecha)}</td>
                      <td className={TD}>{o.linea ?? '—'}</td>
                      <td className={cn(TD, 'text-right tabular-nums')}>
                        {o.precio.importe !== null ? (
                          <>
                            {usd(o.precio.importe)}
                            {o.precio.unidad && o.precio.unidad !== 'viaje' && (
                              <span className="block text-xs text-tinta-suave">
                                {o.precio.cantidad} × {usd(o.precio.precio)} {ETIQUETA_UNIDAD[o.precio.unidad]}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-alerta">{o.precio.falta}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function FacturasVista({ abierta, onAbrir }: { abierta: number | null; onAbrir: (id: number | null) => void }) {
  const [estado, setEstado] = useState<EstadoFactura | null>('borrador');
  const { data, isLoading, isError, error, refetch } = useFacturas(estado);
  return (
    <div className="space-y-4">
      {abierta && <FichaFactura id={abierta} onCerrar={() => onAbrir(null)} />}
      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <button
            key={f ?? 'todas'}
            type="button"
            onClick={() => setEstado(f)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm',
              estado === f ? 'border-marca bg-marca-suave font-medium text-marca' : 'border-borde text-tinta-suave hover:bg-hover',
            )}
          >
            {f ? (f === 'borrador' ? 'Prefacturas' : ETIQUETA_ESTADO_FAC[f] + 's') : 'Todas'}
          </button>
        ))}
      </div>
      {isLoading ? (
        <Cargando texto="Leyendo las facturas…" />
      ) : isError || !data ? (
        <ErrorLectura texto="No se pudieron leer las facturas." onReintentar={() => void refetch()} error={error} />
      ) : data.length === 0 ? (
        <Vacio icono={<Receipt className="size-6" />} texto="No hay facturas en este grupo." />
      ) : (
        <div className={cn(TARJETA, 'overflow-x-auto')}>
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-borde">
                <th className={TH}>Número</th>
                <th className={TH}>Cliente</th>
                <th className={TH}>Emitida · vence</th>
                <th className={TH}>Estado</th>
                <th className={cn(TH, 'text-right')}>Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {data.map((f) => (
                <tr key={f.id} className={cn('cursor-pointer hover:bg-hover', abierta === f.id && 'bg-marca-suave/40')} onClick={() => onAbrir(f.id)}>
                  <td className={TD}>
                    <span className="font-medium text-marca">{f.numeroFiscal ?? f.numero}</span>
                    {f.numeroFiscal && <span className="block text-xs text-tinta-suave">{f.numero}</span>}
                  </td>
                  <td className={TD}>{f.cliente}</td>
                  <td className={cn(TD, 'text-xs tabular-nums')}>
                    {f.fechaEmision ? formatearFechaDia(f.fechaEmision) : '—'}
                    {f.vence && <span className={cn('block', f.estado === 'vencida' ? 'font-medium text-error' : 'text-tinta-suave')}>{formatearFechaDia(f.vence)}</span>}
                  </td>
                  <td className={TD}>
                    <ChipFactura estado={f.estado} />
                  </td>
                  <td className={cn(TD, 'text-right font-medium tabular-nums')}>{usd(f.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface FilaEdit {
  clave: string;
  servicioId: number | null;
  descripcion: string;
  cantidad: string;
  precio: string;
}
let k = 0;

function FichaFactura({ id, onCerrar }: { id: number; onCerrar: () => void }) {
  const { zonaHoraria } = useSesion();
  const { data: f, isLoading } = useFactura(id);
  const puedeEditar = useCan('ventas.facturacion:editar');
  const puedeEstado = useCan('ventas.facturacion:transicionar');
  const guardar = useGuardarFactura();
  const emitir = useEmitirFactura();
  const cobrar = useCobrarFactura();
  const anular = useAnularFactura();
  const envio = useEnvio();
  const [filas, setFilas] = useState<FilaEdit[]>([]);
  const [obs, setObs] = useState('');
  const [emision, setEmision] = useState({ numero: '', fecha: hoyEnZona(zonaHoraria) as string });
  const [cobro, setCobro] = useState(hoyEnZona(zonaHoraria) as string);
  // Migración 73: en qué banco o caja entró (solo las de la moneda de la factura)
  const { data: cuentasDinero } = useCuentasParaElegir(puedeEstado);
  const cuentasCobro = (cuentasDinero ?? []).filter((c) => c.moneda === f?.moneda);
  const [cuentaCobro, setCuentaCobro] = useState<number | null>(null);
  useEffect(() => {
    if (!f) return;
    setFilas(f.renglones.map((r) => ({ clave: `r${++k}`, servicioId: r.servicioId, descripcion: r.descripcion, cantidad: String(r.cantidad), precio: String(r.precio) })));
    setObs(f.observacion ?? '');
  }, [f]);

  if (isLoading || !f) return <Cargando texto="Abriendo la factura…" />;
  const borrador = f.estado === 'borrador' && puedeEditar;
  const cambiar = (clave: string, c: Partial<FilaEdit>) => setFilas((fs) => fs.map((x) => (x.clave === clave ? { ...x, ...c } : x)));

  return (
    <section className={cn(TARJETA, 'space-y-4 p-4')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-tinta">
            {f.numeroFiscal ? `Factura ${f.numeroFiscal}` : `Prefactura ${f.numero}`} <ChipFactura estado={f.estado} />
          </h2>
          <p className="text-sm text-tinta-suave">
            {f.cliente}
            {f.identificadorFiscal && ` · ${f.identificadorFiscal}`} · paga a {f.condicionPagoDias} días
            {f.fechaEmision && ` · emitida ${formatearFechaDia(f.fechaEmision)}`}
            {f.vence && ` · vence ${formatearFechaDia(f.vence)}`}
            {f.cobradaEn && ` · cobrada ${formatearFechaDia(f.cobradaEn)}`}
          </p>
          {f.motivo && <p className="text-sm text-tinta-suave">Motivo: {f.motivo}</p>}
        </div>
        <button type="button" className="text-sm text-tinta-suave hover:underline" onClick={onCerrar}>
          Cerrar
        </button>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-borde">
            <th className={TH}>Detalle</th>
            <th className={cn(TH, 'w-24 text-right')}>Cantidad</th>
            <th className={cn(TH, 'w-32 text-right')}>Precio USD</th>
            <th className={cn(TH, 'w-32 text-right')}>Importe</th>
            {borrador && <th className={cn(TH, 'w-8')} />}
          </tr>
        </thead>
        <tbody className="divide-y divide-borde">
          {borrador
            ? filas.map((r) => (
                <tr key={r.clave}>
                  <td className={TD}>
                    <input className="h-9 w-full rounded-md border border-borde bg-panel px-2" value={r.descripcion} onChange={(e) => cambiar(r.clave, { descripcion: e.target.value })} />
                  </td>
                  <td className={TD}>
                    <input className="h-9 w-full rounded-md border border-borde bg-panel px-2 text-right" inputMode="decimal" value={r.cantidad} onChange={(e) => cambiar(r.clave, { cantidad: e.target.value })} />
                  </td>
                  <td className={TD}>
                    <input
                      className={cn('h-9 w-full rounded-md border bg-panel px-2 text-right', Number(r.precio) === 0 ? 'border-alerta' : 'border-borde')}
                      inputMode="decimal"
                      value={r.precio}
                      onChange={(e) => cambiar(r.clave, { precio: e.target.value })}
                    />
                  </td>
                  <td className={cn(TD, 'text-right text-tinta-suave')}>{r.servicioId ? 'operación' : 'cargo'}</td>
                  <td className={TD}>
                    <button type="button" aria-label="Quitar" className="text-tinta-suave hover:text-error" onClick={() => setFilas(filas.filter((x) => x.clave !== r.clave))}>
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))
            : f.renglones.map((r) => (
                <tr key={r.id}>
                  <td className={TD}>{r.descripcion}</td>
                  <td className={cn(TD, 'text-right tabular-nums')}>{r.cantidad.toLocaleString('es-AR')}</td>
                  <td className={cn(TD, 'text-right tabular-nums')}>{usd(r.precio, false)}</td>
                  <td className={cn(TD, 'text-right tabular-nums')}>{usd(r.importe, false)}</td>
                </tr>
              ))}
          <tr className="font-semibold">
            <td className={TD} colSpan={3}>
              Total {borrador && <span className="text-xs font-normal text-tinta-suave">(se recalcula al guardar)</span>}
            </td>
            <td className={cn(TD, 'text-right tabular-nums')}>{usd(f.total)}</td>
          </tr>
        </tbody>
      </table>
      {borrador && (
        <div className="space-y-3">
          <button
            type="button"
            className="inline-flex items-center gap-1 text-sm text-marca hover:underline"
            onClick={() => setFilas([...filas, { clave: `r${++k}`, servicioId: null, descripcion: '', cantidad: '1', precio: '' }])}
          >
            <Plus className="size-4" /> Agregar un cargo (estadía, sobrepeso…)
          </button>
          <Campo label="Observación">
            <input value={obs} onChange={(e) => setObs(e.target.value)} />
          </Campo>
          <button
            type="button"
            className={BOTON_SECUNDARIO}
            disabled={guardar.isPending}
            onClick={() =>
              void envio.enviar(
                guardar.mutateAsync({
                  id: f.id,
                  version: f.version,
                  observacion: obs,
                  renglones: filas.map((r) => ({ servicioId: r.servicioId, descripcion: r.descripcion, cantidad: r.cantidad, precio: r.precio })),
                }),
                () => undefined,
              )
            }
          >
            <Save className="size-4" /> Guardar cambios
          </button>
        </div>
      )}
      <ErrorBase error={envio.error} />

      <div className="flex flex-wrap items-end gap-3 border-t border-borde pt-3">
        {f.estado === 'borrador' && puedeEstado && (
          <>
            <Campo label="N° de la factura electrónica">
              <input value={emision.numero} placeholder="0001-00000123" onChange={(e) => setEmision({ ...emision, numero: e.target.value })} />
            </Campo>
            <Campo label="Fecha de la factura">
              <input type="date" value={emision.fecha} onChange={(e) => setEmision({ ...emision, fecha: e.target.value })} />
            </Campo>
            <button
              type="button"
              className={BOTON_PRIMARIO}
              disabled={emitir.isPending}
              onClick={() => void envio.enviar(emitir.mutateAsync({ id: f.id, version: f.version, numeroFiscal: emision.numero, fecha: emision.fecha }), () => undefined)}
            >
              <Receipt className="size-4" /> Marcar como emitida
            </button>
          </>
        )}
        {(f.estado === 'emitida' || f.estado === 'vencida') && puedeEstado && (
          <>
            <Campo label="Fecha del cobro">
              <input type="date" value={cobro} onChange={(e) => setCobro(e.target.value)} />
            </Campo>
            {cuentasCobro.length > 0 && (
              <Campo label="Entró a">
                <select value={cuentaCobro ?? ''} onChange={(e) => setCuentaCobro(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">Elegí el banco o la caja…</option>
                  {cuentasCobro.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </Campo>
            )}
            <button
              type="button"
              className={BOTON_PRIMARIO}
              disabled={cobrar.isPending}
              onClick={() => void envio.enviar(cobrar.mutateAsync({ id: f.id, fecha: cobro, cuentaId: cuentaCobro }), () => undefined)}
            >
              Registrar el cobro
            </button>
          </>
        )}
        {(f.estado === 'borrador' || f.estado === 'emitida' || f.estado === 'vencida') && puedeEstado && (
          <AccionConMotivo
            etiqueta="Anular"
            icono={<X className="size-4" />}
            titulo={f.estado === 'borrador' ? 'Descartar la prefactura' : 'Anular la factura'}
            explicacion="Las operaciones vuelven a quedar para facturar."
            ocupado={anular.isPending}
            error={envio.error}
            onConfirmar={async (motivo) => {
              const r = await anular.mutateAsync({ id: f.id, motivo });
              if (!r.ok) envio.setError(r.error);
              return r.ok;
            }}
          />
        )}
      </div>
    </section>
  );
}

