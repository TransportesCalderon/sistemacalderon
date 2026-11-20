'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeftRight, Plus, X } from 'lucide-react';
import { Panel, TD, TH, useEnvio } from '@/modules/catalogos/components/comun';
import { AccionConMotivo, Cargando, Chip, Encabezado, ErrorBase, ErrorLectura, Vacio } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { CambiarFechaCobro } from '@/modules/ventas/components/cambiar-fecha-cobro';
import { cn } from '@/shared/lib/cn';
import { hoyEnZona } from '@/shared/lib/fechas';
import { BOTON_PRIMARIO, CONTROL_FILTRO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { cuentasParaMovimiento, dinero, ETIQUETA_MOVIMIENTO, type CuentaDinero } from '../domain/finanzas.types';
import { useAnularMovimiento, useCambiarFechaCobro, useCuentasDinero, useMovimientos, usePlanCuentas, useRegistrarMovimiento } from '../queries/hooks';
import { fecha, OpcionesCuentas } from './comun';

/**
 * Bancos › Movimientos (20/11/2026, plan de simplificación, cambio 4; antes Cobros y pagos › Entradas y salidas): lo que
 * entró y salió de cada banco y caja, y el alta de lo que no es un cobro ni un pago (aportes, retiros, comisiones,
 * transferencias…). Abre con la cuenta de la dirección (?cuenta=) o con la primera caja. Lo de un banco conviene anotarlo
 * desde su cartola, al conciliar la línea; igual se puede elegir un banco (por ejemplo, uno cuya cartola no se puede importar).
 */
export function MovimientosPantalla({ cuentaInicial = null }: { cuentaInicial?: number | null }) {
  const { data: cuentas, isLoading, isError, error, refetch } = useCuentasDinero();
  return (
    <div className="space-y-5">
      <Encabezado titulo="Movimientos" subtitulo="Bancos" />
      <p className="max-w-3xl text-sm text-tinta-suave">
        Lo que entró y salió de cada banco y caja. Acá se anota lo de la caja y lo que no es un cobro ni un pago: aportes o retiros de socios, préstamos,
        comisiones, impuestos, pasar plata entre cuentas. Los cobros y los pagos se registran en{' '}
        <Link href="/analisis/cobros-pagos" className="font-medium text-marca hover:underline">
          Cobros y pagos
        </Link>
        ; lo que llega en la cartola de un banco, al conciliarla.
      </p>
      {isLoading ? (
        <Cargando texto="Buscando las cuentas…" />
      ) : isError || !cuentas ? (
        <ErrorLectura texto="No se pudieron leer las cuentas." onReintentar={() => void refetch()} error={error} />
      ) : (
        <Movimientos cuentas={cuentas} cuentaInicial={cuentaInicial} />
      )}
    </div>
  );
}

function Movimientos({ cuentas, cuentaInicial }: { cuentas: CuentaDinero[]; cuentaInicial: number | null }) {
  const puede = useCan('finanzas.cobros_pagos:editar');
  const puedeAnular = useCan('finanzas.cobros_pagos:transicionar');
  const cajas = cuentas.filter((c) => c.tipo === 'caja');
  const bancos = cuentas.filter((c) => c.tipo !== 'caja');
  const [cuenta, setCuenta] = useState<number | null>(
    cuentas.some((c) => c.id === cuentaInicial) ? cuentaInicial : (cajas.find((c) => c.activa)?.id ?? null),
  );
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [nuevo, setNuevo] = useState(false);
  const { data, isLoading, isError, error, refetch } = useMovimientos(cuenta, desde || null, hasta || null);
  const anular = useAnularMovimiento();
  // Migración 273: un cobro cargado con la fecha equivocada se corrige sin anularlo
  const cambiarFecha = useCambiarFechaCobro();
  const envio = useEnvio();
  const opciones = (lista: CuentaDinero[]) =>
    lista.map((c) => (
      <option key={c.id} value={c.id}>
        {c.nombre}
      </option>
    ));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <select className={CONTROL_FILTRO} value={cuenta ?? ''} onChange={(e) => setCuenta(e.target.value ? Number(e.target.value) : null)} aria-label="Cuenta">
          <option value="">Todas las cuentas</option>
          {cajas.length > 0 && <optgroup label="Cajas">{opciones(cajas)}</optgroup>}
          {bancos.length > 0 && <optgroup label="Bancos">{opciones(bancos)}</optgroup>}
        </select>
        <label className="flex items-center gap-1 text-sm text-tinta-suave">
          Desde <input type="date" className={CONTROL_FILTRO} value={desde} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label className="flex items-center gap-1 text-sm text-tinta-suave">
          Hasta <input type="date" className={CONTROL_FILTRO} value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </label>
        {puede && !nuevo && (
          <button type="button" className={cn(BOTON_PRIMARIO, 'ml-auto')} onClick={() => setNuevo(true)}>
            <Plus className="size-4" /> Otro ingreso, egreso o transferencia
          </button>
        )}
      </div>
      {nuevo && <NuevoMovimiento cuentas={cuentas.filter((c) => c.activa)} cuentaInicial={cuenta} onCerrar={() => setNuevo(false)} />}
      <ErrorBase error={envio.error} />
      {isLoading ? (
        <Cargando texto="Buscando movimientos…" />
      ) : isError || !data ? (
        <ErrorLectura texto="No se pudieron leer los movimientos." onReintentar={() => void refetch()} error={error} />
      ) : data.length === 0 ? (
        <Vacio icono={<ArrowLeftRight className="size-6" />} texto="No hay movimientos en ese período." />
      ) : (
        <div className={cn(TARJETA, 'overflow-x-auto')}>
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b border-borde bg-fondo">
              <tr>
                <th className={TH}>Fecha</th>
                <th className={TH}>Qué</th>
                <th className={TH}>Cuenta</th>
                <th className={cn(TH, 'text-right')}>Monto</th>
                <th className={TH}>Banco</th>
                <th className={TH} />
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {data.map((m) => (
                <tr key={m.id} className={cn(m.estado === 'anulado' && 'text-tinta-suave')}>
                  <td className={cn(TD, 'tabular-nums')}>
                    {fecha(m.fecha)}
                    <span className="block text-xs text-tinta-suave">{m.numero}</span>
                  </td>
                  <td className={TD}>
                    <span className="text-xs text-tinta-suave">{ETIQUETA_MOVIMIENTO[m.tipo]}</span>
                    <span className={cn('block', m.estado === 'anulado' && 'line-through')}>{m.detalle}</span>
                    {m.estado === 'anulado' && <span className="block text-xs">Anulado: {m.motivo}</span>}
                  </td>
                  <td className={TD}>{m.cuenta}</td>
                  <td className={cn(TD, 'text-right font-medium tabular-nums', m.monto < 0 ? 'text-tinta' : 'text-exito')}>{dinero(m.monto, m.moneda)}</td>
                  <td className={TD}>
                    {m.conciliado ? <Chip tono="exito">Conciliado</Chip> : m.estado === 'vigente' ? <Chip tono="neutro">Sin conciliar</Chip> : null}
                  </td>
                  <td className={cn(TD, 'space-y-2 text-right')}>
                    {puedeAnular && m.estado === 'vigente' && m.tipo === 'cobro' && !m.conciliado && (
                      <CambiarFechaCobro
                        fechaActual={m.fecha.slice(0, 10)}
                        ocupado={cambiarFecha.isPending}
                        onGuardar={async (f, motivo) => {
                          const r = await cambiarFecha.mutateAsync({ id: m.id, fecha: f, motivo });
                          return r.ok ? null : r.error;
                        }}
                      />
                    )}
                    {puedeAnular && m.estado === 'vigente' && (
                      <AccionConMotivo
                        etiqueta="Anular"
                        icono={<X className="size-4" />}
                        titulo={`Anular ${m.numero}`}
                        explicacion="Se borra su asiento. Si era un cobro, la factura vuelve a quedar por cobrar; si era un pago, el gasto vuelve a quedar por pagar."
                        ocupado={anular.isPending}
                        error={envio.error}
                        onConfirmar={async (motivo) => {
                          const r = await anular.mutateAsync({ id: m.id, motivo });
                          if (!r.ok) envio.setError(r.error);
                          return r.ok;
                        }}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Otro ingreso, egreso o transferencia. Las cajas van primero; si se elige un banco, se avisa que conviene hacerlo desde su cartola. */
function NuevoMovimiento({ cuentas, cuentaInicial, onCerrar }: { cuentas: CuentaDinero[]; cuentaInicial: number | null; onCerrar: () => void }) {
  const { zonaHoraria } = useSesion();
  const { data: plan } = usePlanCuentas();
  const registrar = useRegistrarMovimiento();
  const envio = useEnvio();
  const cajas = cuentas.filter((c) => c.tipo === 'caja');
  const bancos = cuentas.filter((c) => c.tipo !== 'caja');
  const [tipo, setTipo] = useState<'ingreso' | 'egreso' | 'transferencia'>('egreso');
  const [cuenta, setCuenta] = useState<number | null>(
    cuentas.some((c) => c.id === cuentaInicial) ? cuentaInicial : (cajas[0]?.id ?? bancos[0]?.id ?? null),
  );
  const [destino, setDestino] = useState<number | null>(null);
  const [cuentaId, setCuentaId] = useState<number | null>(null);
  const [f, setF] = useState(hoyEnZona(zonaHoraria) as string);
  const [monto, setMonto] = useState('');
  const [montoDestino, setMontoDestino] = useState('');
  const [desc, setDesc] = useState('');
  if (cuentas.length === 0) return <SinCuentas />;
  const cOrigen = cuentas.find((c) => c.id === cuenta);
  const cDestino = cuentas.find((c) => c.id === destino);
  const otraMoneda = tipo === 'transferencia' && cOrigen && cDestino && cOrigen.moneda !== cDestino.moneda;
  const opciones = (lista: CuentaDinero[]) =>
    lista.map((c) => (
      <option key={c.id} value={c.id}>
        {c.nombre} ({c.moneda})
      </option>
    ));
  return (
    <Panel
      titulo="Otro ingreso, egreso o transferencia"
      explicacion="Para cobrar una factura o pagarle a un proveedor usá Cobros y pagos. Acá van: aportes o retiros de socios, préstamos, comisiones, impuestos, pasar plata entre cuentas…"
      error={envio.error}
      ocupado={registrar.isPending}
      textoBoton="Registrar"
      onCerrar={onCerrar}
      onConfirmar={() =>
        void envio.enviar(
          registrar.mutateAsync({
            tipo,
            fecha: f,
            cuentaDineroId: cuenta ?? 0,
            monto,
            facturaId: null,
            gastoId: null,
            cuentaId: tipo === 'transferencia' ? null : cuentaId,
            destinoId: tipo === 'transferencia' ? destino : null,
            montoDestino: otraMoneda ? montoDestino : null,
            montoDocumento: null,
            descripcion: desc,
          }),
          onCerrar,
        )
      }
    >
      <Campo label="Qué es">
        <select value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
          <option value="egreso">Salió plata (otro egreso)</option>
          <option value="ingreso">Entró plata (otro ingreso)</option>
          <option value="transferencia">Transferencia entre mis cuentas</option>
        </select>
      </Campo>
      <Campo label={tipo === 'transferencia' ? 'Desde' : 'Caja o banco'}>
        <select value={cuenta ?? ''} onChange={(e) => setCuenta(Number(e.target.value))}>
          {cajas.length > 0 && <optgroup label="Cajas">{opciones(cajas)}</optgroup>}
          {bancos.length > 0 && <optgroup label="Bancos (mejor desde su cartola)">{opciones(bancos)}</optgroup>}
        </select>
      </Campo>
      {tipo === 'transferencia' ? (
        <Campo label="Hacia">
          <select value={destino ?? ''} onChange={(e) => setDestino(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Elegí…</option>
            {opciones(cuentas.filter((c) => c.id !== cuenta))}
          </select>
        </Campo>
      ) : (
        <Campo label="Cuenta contable (de qué es)">
          <select value={cuentaId ?? ''} onChange={(e) => setCuentaId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Elegí…</option>
            <OpcionesCuentas cuentas={cuentasParaMovimiento(plan ?? [])} />
          </select>
        </Campo>
      )}
      <Campo label="Fecha">
        <input type="date" value={f} onChange={(e) => setF(e.target.value)} />
      </Campo>
      <Campo label={`Monto${cOrigen ? ` (${cOrigen.moneda})` : ''}`}>
        <input inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} />
      </Campo>
      {otraMoneda && (
        <Campo label={`Llegó (${cDestino!.moneda})`}>
          <input inputMode="decimal" value={montoDestino} onChange={(e) => setMontoDestino(e.target.value)} />
        </Campo>
      )}
      <Campo label="Descripción">
        <input value={desc} maxLength={200} placeholder="Ej.: comisión de mantención" onChange={(e) => setDesc(e.target.value)} />
      </Campo>
      {cOrigen?.tipo === 'banco' && (
        <p className="text-xs text-alerta sm:col-span-2 lg:col-span-3">
          {cOrigen.nombre} es un banco: si este movimiento ya está en su cartola, anotalo desde ahí (Bancos › Cuentas › {cOrigen.nombre}, «Decir qué
          es…» en la línea) y queda conciliado.
        </p>
      )}
    </Panel>
  );
}

function SinCuentas() {
  return (
    <p className="pt-3 text-sm text-tinta-suave">
      Primero cargá un banco o caja en{' '}
      <Link href="/conciliacion" className="font-medium text-marca underline">
        Bancos › Cuentas
      </Link>
      .
    </p>
  );
}
