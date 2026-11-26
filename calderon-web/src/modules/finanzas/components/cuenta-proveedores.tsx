'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
import { Panel, TD, TH, useEnvio } from '@/modules/catalogos/components/comun';
import { useProveedores } from '@/modules/catalogos/queries/hooks';
import { AccionConMotivo, Cargando, Chip, ErrorLectura, Seccion } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { hoyEnZona } from '@/shared/lib/fechas';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { BOTON_SECUNDARIO } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { dinero } from '../domain/finanzas.types';
import { ETIQUETA_MOVIMIENTO_PROVEEDOR, type SaldoProveedor } from '../domain/orden-pago';
import { useCuentasDinero } from '../queries/hooks';
import { useAnularOrdenPago, useAplicarPagosACuenta, useCuentaProveedor, useRegistrarOrdenPago, useSaldosProveedores } from '../queries/orden-pago.hooks';
import { fecha, MONEDAS } from './comun';

/**
 * Migración 281 · Por pagar › Cuenta corriente de proveedores: por proveedor, el saldo (facturas sin pagar + cargas sin
 * factura − pagos a cuenta) y sus movimientos, y la orden de pago (un pago al proveedor, a facturas o a cuenta).
 * 20/11/2026 (plan de simplificación, cambios 2 y 3): es el total de Por pagar y su «Pagar» es el botón de pago del
 * sistema. El formulario se abre debajo de la fila del proveedor; la ficha de un gasto llega con
 * ?proveedor=&moneda=&pagar=1 y abre ese proveedor con el pago listo.
 * 26/11/2026 (migración 370): los movimientos de un proveedor salen por vencimiento, de lo más viejo a lo más nuevo
 * (el orden y el saldo acumulado los manda la base); el vencimiento tiene su columna.
 */
export function CuentaProveedores() {
  // Llega con la migración 281: antes de aplicarla en la base, no se muestra (en vez de un error)
  const hay = useBaseTiene(281);
  if (!hay) return null;
  return <CuentaProveedoresLista />;
}

function CuentaProveedoresLista() {
  const { data, isLoading, isError, error, refetch } = useSaldosProveedores();
  const puede = useCan('finanzas.cobros_pagos:editar');
  // Mientras no se toque nada, manda la dirección (el enlace de la ficha del gasto); después, lo que se elige acá
  const params = useSearchParams();
  const provUrl = Number(params.get('proveedor')) || null;
  const monUrl = params.get('moneda') || 'CLP';
  const [abiertoElegido, setAbierto] = useState<string | null | undefined>(undefined);
  const [pagarElegido, setPagar] = useState<{ proveedorId: number | null; moneda: string } | null | undefined>(undefined);
  const abierto = abiertoElegido !== undefined ? abiertoElegido : provUrl ? `${provUrl}-${monUrl}` : null;
  const pagar = pagarElegido !== undefined ? pagarElegido : puede && provUrl && params.get('pagar') === '1' ? { proveedorId: provUrl, moneda: monUrl } : null;
  if (isLoading) return <Cargando texto="Buscando la cuenta de cada proveedor…" />;
  if (isError || !data) return <ErrorLectura texto="No se pudo leer la cuenta corriente de los proveedores." onReintentar={() => void refetch()} error={error} />;
  const totales = Object.entries(data.reduce<Record<string, number>>((t, x) => ({ ...t, [x.moneda]: (t[x.moneda] ?? 0) + x.saldo }), {})).map(([m, v]) => dinero(v, m));
  // El pago de un proveedor de la lista se abre debajo de su fila; el de otro proveedor, arriba de la lista
  const enLaLista = pagar !== null && data.some((x) => x.proveedorId === pagar.proveedorId && x.moneda === pagar.moneda);
  return (
    <Seccion titulo={`Cuenta corriente de proveedores${totales.length > 0 ? ` · ${totales.join(' · ')}` : ''}`}>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <p className="text-sm text-tinta-suave">
          Lo que se le debe a cada proveedor: facturas sin pagar más cargas sin factura, menos lo pagado a cuenta. Para pagarle, tocá «Pagar» en su
          fila: cancela sus facturas de la más vieja a la más nueva y lo que sobra queda a cuenta. Tocá el nombre para ver sus movimientos.
        </p>
        {puede && !pagar && (
          <button type="button" className={cn(BOTON_SECUNDARIO, 'ml-auto')} onClick={() => setPagar({ proveedorId: null, moneda: 'CLP' })}>
            <Plus className="size-4" /> {data.length > 0 ? 'Pagar a otro proveedor' : 'Pagar a un proveedor'}
          </button>
        )}
      </div>
      {pagar && !enLaLista && (
        <OrdenPagoForm key={`${pagar.proveedorId ?? 0}-${pagar.moneda}`} proveedorId={pagar.proveedorId} moneda={pagar.moneda} onCerrar={() => setPagar(null)} />
      )}
      {data.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-y border-borde bg-fondo">
              <tr>
                <th className={TH}>Proveedor</th>
                <th className={cn(TH, 'text-right')}>Facturas sin pagar</th>
                <th className={cn(TH, 'text-right')}>Cargas sin factura</th>
                <th className={cn(TH, 'text-right')}>Pagado a cuenta</th>
                <th className={cn(TH, 'text-right')}>Saldo</th>
                <th className={TH} />
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {data.map((x) => {
                const clave = `${x.proveedorId}-${x.moneda}`;
                const pagando = pagar !== null && pagar.proveedorId === x.proveedorId && pagar.moneda === x.moneda;
                return (
                  <Fragment key={clave}>
                    <Fila
                      x={x}
                      abierta={abierto === clave}
                      pagando={pagando}
                      enfocar={pagando && pagarElegido === undefined}
                      puede={puede}
                      onAbrir={() => setAbierto(abierto === clave ? null : clave)}
                      onPagar={() => setPagar(pagando ? null : { proveedorId: x.proveedorId, moneda: x.moneda })}
                    />
                    {pagando && (
                      <tr>
                        <td colSpan={6} className="px-3 pb-1">
                          <OrdenPagoForm key={clave} proveedorId={x.proveedorId} moneda={x.moneda} onCerrar={() => setPagar(null)} />
                        </td>
                      </tr>
                    )}
                    {abierto === clave && (
                      <tr>
                        <td colSpan={6} className="bg-fondo px-3 py-2">
                          <Movimientos proveedorId={x.proveedorId} moneda={x.moneda} puede={puede} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Seccion>
  );
}

function Fila({
  x,
  abierta,
  pagando,
  enfocar,
  puede,
  onAbrir,
  onPagar,
}: {
  x: SaldoProveedor;
  abierta: boolean;
  pagando: boolean;
  enfocar: boolean;
  puede: boolean;
  onAbrir: () => void;
  onPagar: () => void;
}) {
  const fila = useRef<HTMLTableRowElement>(null);
  // Si se llegó desde la ficha de un gasto, el proveedor queda a la vista con su pago abierto
  useEffect(() => {
    if (enfocar) fila.current?.scrollIntoView({ block: 'center' });
  }, [enfocar]);
  return (
    <tr ref={fila}>
      <td className={TD}>
        <button type="button" className="flex items-center gap-1 text-left font-medium text-tinta" onClick={onAbrir} aria-expanded={abierta}>
          {abierta ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          {x.proveedor}
        </button>
        {x.vencido > 0 && (
          <span className="ml-5">
            <Chip tono="error">Vencido {dinero(x.vencido, x.moneda)}</Chip>
          </span>
        )}
      </td>
      <td className={cn(TD, 'text-right tabular-nums')}>{x.facturas > 0 ? dinero(x.facturasSaldo, x.moneda) : '—'}</td>
      <td className={cn(TD, 'text-right tabular-nums')}>{x.cargas > 0 ? dinero(x.cargasImporte, x.moneda) : '—'}</td>
      <td className={cn(TD, 'text-right tabular-nums')}>{x.aCuenta > 0 ? dinero(x.aCuenta, x.moneda) : '—'}</td>
      <td className={cn(TD, 'text-right font-semibold tabular-nums')}>{dinero(x.saldo, x.moneda)}</td>
      <td className={cn(TD, 'text-right')}>
        {puede && (
          <button type="button" className={BOTON_SECUNDARIO} onClick={onPagar} aria-expanded={pagando}>
            {pagando ? 'Cerrar' : 'Pagar'}
          </button>
        )}
      </td>
    </tr>
  );
}

function Movimientos({ proveedorId, moneda, puede }: { proveedorId: number; moneda: string; puede: boolean }) {
  const { zonaHoraria } = useSesion();
  const { data, isLoading, isError, error, refetch } = useCuentaProveedor(proveedorId, moneda);
  const anular = useAnularOrdenPago();
  const aplicar = useAplicarPagosACuenta();
  const envio = useEnvio();
  const puedeAnular = useCan('finanzas.cobros_pagos:transicionar');
  if (isLoading) return <Cargando texto="Buscando los movimientos…" />;
  if (isError || !data) return <ErrorLectura texto="No se pudieron leer los movimientos." onReintentar={() => void refetch()} error={error} />;
  const hayFacturaImpaga = data.movimientos.some((m) => m.tipo === 'factura' && (m.pendiente ?? 0) > 0);
  const hoy = hoyEnZona(zonaHoraria) as string;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span>
          Saldo: <strong className="tabular-nums">{dinero(data.saldo, data.moneda)}</strong>
        </span>
        {data.aCuenta > 0 && <span className="text-tinta-suave">Pagado a cuenta sin aplicar: {dinero(data.aCuenta, data.moneda)}</span>}
        {puede && data.aCuenta > 0 && hayFacturaImpaga && (
          <button
            type="button"
            className={BOTON_SECUNDARIO}
            disabled={aplicar.isPending}
            onClick={() => void envio.enviar(aplicar.mutateAsync({ proveedorId }), () => undefined)}
          >
            Aplicar lo pagado a cuenta a las facturas
          </button>
        )}
      </div>
      {data.porVencimiento && data.movimientos.length > 1 && (
        <p className="text-xs text-tinta-suave">
          Ordenado por vencimiento, de lo más viejo a lo más nuevo: es el orden en que «Pagar» cancela las facturas. Los pagos van por su fecha.
        </p>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-tinta-suave">
            <th className="py-1 pr-3 font-medium">Vence</th>
            <th className="py-1 pr-3 font-medium">Fecha</th>
            <th className="py-1 pr-3 font-medium">Qué es</th>
            <th className="py-1 pr-3 font-medium">Detalle</th>
            <th className="py-1 pr-3 text-right font-medium">Suma a la deuda</th>
            <th className="py-1 pr-3 text-right font-medium">Pagado</th>
            <th className="py-1 pr-3 text-right font-medium">Saldo</th>
            <th className="py-1 font-medium" />
          </tr>
        </thead>
        <tbody className="divide-y divide-borde">
          {data.movimientos.map((m) => (
            <tr key={`${m.tipo}-${m.id}`}>
              {/* En rojo: vencida y todavía falta pagarla */}
              <td className={cn('py-1.5 pr-3 whitespace-nowrap', m.tipo === 'factura' && (m.pendiente ?? 0) > 0 && m.vence !== null && m.vence < hoy && 'font-medium text-error')}>
                {m.vence ? fecha(m.vence) : ''}
              </td>
              <td className={cn('py-1.5 pr-3 whitespace-nowrap', m.vence && 'text-tinta-suave')}>{fecha(m.fecha)}</td>
              <td className="py-1.5 pr-3 whitespace-nowrap">
                {ETIQUETA_MOVIMIENTO_PROVEEDOR[m.tipo]} <span className="text-tinta-suave">{m.numero}</span>
              </td>
              <td className="py-1.5 pr-3">
                {m.detalle}
                {m.cuenta && <span className="text-tinta-suave"> · {m.cuenta}</span>}
                {m.tipo === 'factura' && (m.pendiente ?? 0) > 0 && (
                  <>
                    {' '}
                    <span className="whitespace-nowrap text-tinta-suave">· falta pagar {dinero(m.pendiente, data.moneda)}</span>
                  </>
                )}
                {m.tipo === 'orden_pago' && (m.pendiente ?? 0) > 0 && <span className="text-tinta-suave"> · a cuenta {dinero(m.pendiente, data.moneda)}</span>}
              </td>
              <td className="py-1.5 pr-3 text-right whitespace-nowrap tabular-nums">{m.debe > 0 ? dinero(m.debe, data.moneda) : ''}</td>
              <td className="py-1.5 pr-3 text-right whitespace-nowrap tabular-nums">{m.haber > 0 ? dinero(m.haber, data.moneda) : ''}</td>
              <td className="py-1.5 pr-3 text-right whitespace-nowrap tabular-nums">{dinero(m.saldo, data.moneda)}</td>
              <td className="py-1.5 text-right">
                {puedeAnular && m.tipo === 'orden_pago' && m.ordenPagoId !== null && (
                  <AccionConMotivo
                    etiqueta="Anular"
                    icono={<X className="size-4" />}
                    titulo={`Anular ${m.numero}`}
                    explicacion="Se anula el pago: la plata vuelve al banco o a la caja y las facturas que canceló vuelven a quedar por pagar."
                    ocupado={anular.isPending}
                    error={envio.error}
                    onConfirmar={async (motivo) => {
                      const res = await anular.mutateAsync({ id: m.ordenPagoId ?? 0, motivo });
                      if (!res.ok) envio.setError(res.error);
                      return res.ok;
                    }}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Orden de pago: un pago a un proveedor desde un banco o caja. Cancela sus facturas más viejas; lo que sobra queda a cuenta. */
function OrdenPagoForm({ proveedorId, moneda, onCerrar }: { proveedorId: number | null; moneda: string; onCerrar: () => void }) {
  const { zonaHoraria } = useSesion();
  const { data: proveedores } = useProveedores();
  const { data: cuentas } = useCuentasDinero();
  const registrar = useRegistrarOrdenPago();
  const envio = useEnvio();
  const activas = (cuentas ?? []).filter((c) => c.activa);
  const [prov, setProv] = useState<number | null>(proveedorId);
  const [cuenta, setCuenta] = useState<number | null>(null);
  const [mon, setMon] = useState(moneda);
  const [f, setF] = useState(hoyEnZona(zonaHoraria) as string);
  const [monto, setMonto] = useState('');
  const [montoDeuda, setMontoDeuda] = useState('');
  const [obs, setObs] = useState('');
  const cOrigen = activas.find((c) => c.id === cuenta);
  const otraMoneda = cOrigen !== undefined && cOrigen.moneda !== mon;
  return (
    <div className="mb-4">
      <Panel
        titulo="Pagar a un proveedor"
        explicacion="Queda como orden de pago. Cancela sus facturas sin pagar, de la más vieja a la más nueva; si sobra o todavía no hay factura, queda a cuenta y se descuenta del saldo."
        error={envio.error}
        ocupado={registrar.isPending}
        textoBoton="Registrar el pago"
        onCerrar={onCerrar}
        onConfirmar={() =>
          void envio.enviar(
            registrar.mutateAsync({
              proveedorId: prov ?? 0,
              cuentaDineroId: cuenta ?? 0,
              fecha: f,
              monto,
              moneda: mon,
              montoDeuda: otraMoneda ? montoDeuda : null,
              observacion: obs,
            }),
            onCerrar,
          )
        }
      >
        <Campo label="Proveedor">
          <select value={prov ?? ''} onChange={(e) => setProv(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Elegí…</option>
            {(proveedores ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.razonSocial}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="La deuda está en">
          <select value={mon} onChange={(e) => setMon(e.target.value)}>
            {MONEDAS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Sale de (banco o caja)">
          <select value={cuenta ?? ''} onChange={(e) => setCuenta(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Elegí…</option>
            {activas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} ({c.moneda})
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Fecha">
          <input type="date" value={f} onChange={(e) => setF(e.target.value)} />
        </Campo>
        <Campo label={`Salió del banco o de la caja${cOrigen ? ` (${cOrigen.moneda})` : ''}`}>
          <input inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} />
        </Campo>
        {otraMoneda && (
          <Campo label={`Cuánto se le pagó al proveedor (${mon})`} ayuda="Es lo que baja de la deuda.">
            <input inputMode="decimal" value={montoDeuda} onChange={(e) => setMontoDeuda(e.target.value)} />
          </Campo>
        )}
        <Campo label="Observación">
          <input value={obs} maxLength={500} placeholder="Ej.: transferencia por Vita" onChange={(e) => setObs(e.target.value)} />
        </Campo>
      </Panel>
    </div>
  );
}
