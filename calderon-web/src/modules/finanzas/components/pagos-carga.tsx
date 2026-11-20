'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, Check, CreditCard, Fuel, LoaderCircle, X } from 'lucide-react';
import { AccionConMotivo, Chip } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import type { ErrorAccion } from '@/server/actions/result';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora, hoyEnZona } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { invalidar } from '@/shared/query/invalidar';
import { browserDb } from '@/shared/supabase/browser';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { pagoCargaAnular, pagoCargaTarjeta, pagoCargaTransferir } from '../actions/pago-carga.actions';
import { parsearPagosCarga, type PagoCarga } from '../domain/pago-carga';
import { useCuentasDinero } from '../queries/hooks';
import { ElegirCuentaDinero } from './elegir-cuenta';

const plata = (v: number | null, moneda: string) => (v === null ? '—' : `${moneda} ${formatearNumero(v, 0)}`);
const aNumero = (s: string) => {
  const x = s.trim().replace(/\./g, '').replace(',', '.');
  return x === '' || !Number.isFinite(Number(x)) ? null : Number(x);
};

/**
 * Migración 290 · Cargas de combustible en Chile autorizadas: Finanzas habilita la tarjeta de flota (tractor y litros)
 * o transfiere a la estación (cuánto y a quién) y deja registrada la orden de pago a cuenta.
 */
export function PagosCarga() {
  const hay = useBaseTiene(290);
  const [todos, setTodos] = useState(false);
  const q = useQuery({
    queryKey: ['finanzas', 'pagos-carga', todos] as const,
    enabled: hay,
    refetchInterval: 120_000,
    queryFn: async () => {
      const { data, error } = await browserDb().schema('fin').rpc('fn_pagos_carga', { p_todos: todos });
      if (error) throw error;
      return parsearPagosCarga(data);
    },
  });
  if (!hay || q.isError) return null;
  const lista = q.data ?? [];
  const pendientes = lista.filter((p) => p.estado === 'pendiente');
  if (!todos && pendientes.length === 0) return null;
  return (
    <section className={cn(TARJETA, 'space-y-3 p-4')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold text-tinta">
          <Fuel className="size-4 text-marca" /> Cargas de combustible en Chile para pagar
          {pendientes.length > 0 && <Chip tono="alerta">{pendientes.length} pendiente{pendientes.length === 1 ? '' : 's'}</Chip>}
        </h2>
        <label className="flex items-center gap-2 text-sm text-tinta-suave">
          <input type="checkbox" className="size-4 accent-marca" checked={todos} onChange={(e) => setTodos(e.target.checked)} /> Ver también las hechas
        </label>
      </div>
      <p className="text-sm text-tinta-suave">
        Las autorizó quien autoriza cargas. Con tarjeta: habilitala para ese tractor y esos litros. Con transferencia: transferile a la estación y registralo acá
        (queda como orden de pago a cuenta del proveedor de la estación; cuando llegue la factura, se aplica).
      </p>
      {q.isPending ? (
        <p className="text-sm text-tinta-suave">Buscando…</p>
      ) : lista.length === 0 ? (
        <p className="text-sm text-tinta-suave">No hay nada en los últimos 60 días.</p>
      ) : (
        <ul className="space-y-3">
          {lista.map((p) => (
            <FilaPago key={p.id} p={p} />
          ))}
        </ul>
      )}
    </section>
  );
}

function FilaPago({ p }: { p: PagoCarga }) {
  const { zonaHoraria } = useSesion();
  const puede = useCan('finanzas.cobros_pagos:editar');
  const qc = useQueryClient();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<ErrorAccion | null>(null);
  const [transfiriendo, setTransfiriendo] = useState(false);
  const recargar = () => invalidar(qc, 'finanzas');
  const pendiente = p.estado === 'pendiente';
  const tarjeta = p.medio === 'tarjeta';

  return (
    <li className={cn('space-y-2 rounded-lg border border-borde p-3', pendiente && 'border-l-4 border-l-alerta')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 font-medium text-tinta">
            {tarjeta ? <CreditCard className="size-4" /> : <ArrowRightLeft className="size-4" />}
            {tarjeta ? 'Habilitar la tarjeta' : 'Transferir a la estación'} · <span className="font-mono">{p.patente ?? '—'}</span>
          </p>
          <p className="text-xs text-tinta-suave">
            {p.orden} · {p.estacion}
            {p.chofer && ` · ${p.chofer}`}
            {p.autorizadaEn && ` · autorizada ${formatearFechaHora(p.autorizadaEn, zonaHoraria)}`}
          </p>
        </div>
        <Chip tono={pendiente ? 'alerta' : p.estado === 'hecho' ? 'exito' : 'neutro'}>
          {pendiente ? 'Pendiente' : p.estado === 'hecho' ? (tarjeta ? 'Tarjeta habilitada' : 'Transferido') : 'Anulado'}
        </Chip>
      </div>
      <div className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
        <p>
          <span className="text-tinta-suave">A cargar:</span> {p.aCargar ?? '—'}
          {p.litros !== null && ` · ≈ ${formatearNumero(p.litros, 0)} L`}
        </p>
        <p>
          <span className="text-tinta-suave">Plata aproximada:</span>{' '}
          {p.importe !== null ? <strong>{plata(p.importe, p.moneda)}</strong> : <span className="text-alerta">sin calcular (no se sabe cuántos litros carga)</span>}
          {p.precio !== null && <span className="text-tinta-suave"> (a {formatearNumero(p.precio, 0)} por litro)</span>}
        </p>
        {!tarjeta && (
          <p>
            <span className="text-tinta-suave">A quién:</span> {p.proveedor ?? <span className="text-error">la estación no tiene proveedor</span>}
            {p.proveedorRut && ` · ${p.proveedorRut}`}
          </p>
        )}
        {p.cargadoL !== null && (
          <p>
            <span className="text-tinta-suave">Cargó:</span> {formatearNumero(p.cargadoL, 2)} L{p.cargadoImporte !== null && ` · ${plata(p.cargadoImporte, p.moneda)}`}
          </p>
        )}
        {p.ordenPago && (
          <p>
            <span className="text-tinta-suave">Pago:</span> {p.ordenPago}
            {p.pagado !== null && ` · ${plata(p.pagado, p.moneda)}`}
          </p>
        )}
        {(p.hechoPor || p.nota) && (
          <p className="text-tinta-suave">
            {p.hechoPor && `${p.hechoPor}${p.hechoEn ? ` · ${formatearFechaHora(p.hechoEn, zonaHoraria)}` : ''}`}
            {p.nota && ` · ${p.nota}`}
          </p>
        )}
      </div>
      {pendiente && puede && !transfiriendo && (
        <div className="flex flex-wrap items-center gap-2">
          {tarjeta ? (
            <button
              type="button"
              className={BOTON_PRIMARIO}
              disabled={ocupado}
              onClick={async () => {
                setOcupado(true);
                setError(null);
                const r = await pagoCargaTarjeta({ id: p.id, nota: '' });
                setOcupado(false);
                if (!r.ok) return setError(r.error);
                await recargar();
              }}
            >
              {ocupado ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} Tarjeta habilitada
            </button>
          ) : (
            <button type="button" className={BOTON_PRIMARIO} onClick={() => setTransfiriendo(true)}>
              <ArrowRightLeft className="size-4" /> Registrar la transferencia
            </button>
          )}
          <AccionConMotivo
            etiqueta="No hace falta"
            icono={<X className="size-4" />}
            titulo="Sacar de la lista"
            explicacion="Por ejemplo, si al final no se cargó o se pagó de otra forma."
            ocupado={ocupado}
            error={null}
            onConfirmar={async (motivo) => {
              setOcupado(true);
              setError(null);
              const r = await pagoCargaAnular({ id: p.id, motivo });
              setOcupado(false);
              if (!r.ok) {
                setError(r.error);
                return false;
              }
              await recargar();
              return true;
            }}
          />
        </div>
      )}
      {transfiriendo && <FormTransferencia p={p} onCerrar={() => setTransfiriendo(false)} onListo={recargar} />}
      {error && <p className="text-sm text-error">{error.mensaje}</p>}
    </li>
  );
}

function FormTransferencia({ p, onCerrar, onListo }: { p: PagoCarga; onCerrar: () => void; onListo: () => Promise<unknown> }) {
  const { zonaHoraria } = useSesion();
  const cuentas = useCuentasDinero();
  const [cuenta, setCuenta] = useState<number | null>(null);
  const [fecha, setFecha] = useState(hoyEnZona(zonaHoraria) as string);
  const [monto, setMonto] = useState(p.importe !== null ? String(p.importe) : '');
  const [deuda, setDeuda] = useState(p.importe !== null ? String(p.importe) : '');
  const [obs, setObs] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const monedaCuenta = cuentas.data?.find((c) => c.id === cuenta)?.moneda ?? null;
  const otraMoneda = monedaCuenta !== null && monedaCuenta !== p.moneda;
  return (
    <div className="grid gap-3 rounded-lg border border-borde bg-fondo/40 p-3 sm:grid-cols-4">
      <ElegirCuentaDinero valor={cuenta} onCambio={setCuenta} etiqueta="Sale de (banco)" />
      <Campo label="Fecha">
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </Campo>
      <Campo label={`Cuánto salió${monedaCuenta ? ` (${monedaCuenta})` : ''}`}>
        <input inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} />
      </Campo>
      {otraMoneda && (
        <Campo label={`Cuánto es en ${p.moneda}`}>
          <input inputMode="decimal" value={deuda} onChange={(e) => setDeuda(e.target.value)} />
        </Campo>
      )}
      <Campo label="Observación (opcional)">
        <input maxLength={500} value={obs} onChange={(e) => setObs(e.target.value)} />
      </Campo>
      {error && <p className="text-sm text-error sm:col-span-4">{error}</p>}
      <div className="flex gap-2 sm:col-span-4">
        <button
          type="button"
          className={BOTON_PRIMARIO}
          disabled={ocupado}
          onClick={async () => {
            setError(null);
            const m = aNumero(monto);
            if (cuenta === null) return setError('Elegí de qué banco salió.');
            if (m === null) return setError('Escribí cuánto se transfirió.');
            setOcupado(true);
            const r = await pagoCargaTransferir({ id: p.id, cuentaId: cuenta, fecha, monto: m, montoDeuda: otraMoneda ? aNumero(deuda) : null, observacion: obs });
            setOcupado(false);
            if (!r.ok) return setError(r.error.mensaje);
            onCerrar();
            await onListo();
          }}
        >
          {ocupado ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} Registrar
        </button>
        <button type="button" className={BOTON_SECUNDARIO} disabled={ocupado} onClick={onCerrar}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
