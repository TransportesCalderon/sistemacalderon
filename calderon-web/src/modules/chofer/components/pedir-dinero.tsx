'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Check, HandCoins, LoaderCircle, Send } from 'lucide-react';
import { Chip } from '@/modules/combustible/components/comun/ui';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { formatearFechaDia } from '@/shared/lib/fechas';
import { invalidar } from '@/shared/query/invalidar';
import { browserDb } from '@/shared/supabase/browser';
import { cn } from '@/shared/lib/cn';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { anularMiPedidoFondo, pedirFondoChofer } from '../actions/pedido-fondo.actions';
import { guardarMiCuentaTransferencia } from '../actions/cuenta-transferencia.actions';
import { aTexto, parsearCuentaTransferencia, type CuentaTransferenciaTexto } from '../domain/cuenta-transferencia';
import { CamposCuenta, cuentaCompleta } from './cuenta-transferencia';
import { ElegirCuenta } from './cuentas-varias';
import { parsearTrabas } from '../domain/trabas-pedido';
import { dinero } from '../domain/chofer.types';
import { ESTADO_PEDIDO, parsearMisPedidos, type MiPedido } from '../domain/pedido-fondo';

/** Migración 278 · El chofer pide el dinero del viaje desde su perfil y ve cómo va su pedido. */
const aNumero = (s: string) => {
  const t = s.trim().replace(/\./g, '').replace(',', '.');
  return t === '' ? NaN : Number(t);
};

export function PedirDinero() {
  const hay = useBaseTiene(278);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['chofer', 'fondo', 'mis-pedidos'],
    enabled: hay,
    refetchInterval: 120_000,
    queryFn: async () => {
      const { data, error } = await browserDb().schema('fin').rpc('fn_mis_pedidos_fondo');
      if (error) throw error;
      return parsearMisPedidos(data);
    },
  });
  const [abierto, setAbierto] = useState(false);
  const [moneda, setMoneda] = useState('ARS');
  // Migración 284: a qué cuenta se le transfiere (una por moneda; queda guardada para la próxima)
  const varias = useBaseTiene(303);
  const hayCuenta = useBaseTiene(284) && !varias;
  // Migración 303: el chofer elige a cuál de sus cuentas (null = la principal)
  const [cuentaId, setCuentaId] = useState<number | null>(null);
  const qCuenta = useQuery({
    queryKey: ['chofer', 'fondo', 'mi-cuenta', moneda],
    enabled: hay && hayCuenta && abierto,
    queryFn: async () => {
      const { data, error } = await browserDb().schema('fin').rpc('fn_mi_cuenta_transferencia', { p_moneda: moneda });
      if (error) throw error;
      return parsearCuentaTransferencia(data);
    },
  });
  // Migración 285: sin gastos al día ni tareas terminadas, no se pide (la base igual lo frena)
  const hayTrabas = useBaseTiene(285);
  const qTrabas = useQuery({
    queryKey: ['chofer', 'fondo', 'mis-trabas'],
    enabled: hay && hayTrabas,
    refetchInterval: 120_000,
    queryFn: async () => {
      const { data, error } = await browserDb().schema('fin').rpc('fn_mis_trabas_pedido_fondo');
      if (error) throw error;
      return parsearTrabas(data);
    },
  });
  const trabas = qTrabas.data ?? [];
  const [cuentaEscrita, setCuentaEscrita] = useState<{ moneda: string; v: CuentaTransferenciaTexto } | null>(null);
  const guardada = qCuenta.data ?? null;
  const editandoCuenta = cuentaEscrita !== null && cuentaEscrita.moneda === moneda;
  const cuenta = editandoCuenta ? cuentaEscrita.v : aTexto(guardada);
  const pedirCuenta = hayCuenta && !qCuenta.isPending && (editandoCuenta || !guardada);
  const [importe, setImporte] = useState('');
  const [detalle, setDetalle] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);
  if (!hay) return null;
  const pedidos = q.data ?? [];
  const enCurso = pedidos.some((p) => p.estado === 'solicitado' || p.estado === 'pendiente');
  const recientes = pedidos.slice(0, 3);
  const campo = 'h-12 w-full rounded-md border border-borde bg-panel px-3 text-base';

  return (
    <section className={cn(TARJETA, 'space-y-3 p-4')}>
      <h2 className="flex items-center gap-2 text-sm font-semibold text-tinta">
        <HandCoins className="size-4 text-marca" /> Pedir dinero para el viaje
      </h2>
      {hecho && (
        <p className="flex items-center gap-2 text-sm text-exito">
          <Check className="size-4" /> Pedido {hecho} enviado. Te avisamos cuando lo resuelvan.
        </p>
      )}
      {trabas.length > 0 && !enCurso && (
        <div className="space-y-1 rounded-md border border-alerta/40 bg-alerta/10 p-3 text-sm text-tinta">
          <p className="font-medium">Para pedir dinero, primero te falta:</p>
          <ul className="list-disc space-y-1 pl-5">
            {trabas.map((t, i) => (
              <li key={i}>{t.texto}</li>
            ))}
          </ul>
          <p className="text-xs text-tinta-suave">Si ya lo hiciste o es urgente, hablá con Operaciones.</p>
        </div>
      )}
      {abierto && trabas.length === 0 ? (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            if (pedirCuenta && !cuentaCompleta(cuenta)) return setError('Escribí a qué cuenta te transferimos: banco, número y a nombre de quién está.');
            setOcupado(true);
            if (pedirCuenta) {
              const c = await guardarMiCuentaTransferencia({ moneda, ...cuenta });
              if (!c.ok) {
                setOcupado(false);
                return setError(c.error.mensaje);
              }
              setCuentaEscrita(null);
              await qCuenta.refetch();
            }
            const r = await pedirFondoChofer({ moneda, importe: aNumero(importe), detalle, ...(varias ? { cuentaId } : {}) });
            setOcupado(false);
            if (!r.ok) return setError(r.error.mensaje);
            setHecho(r.data.numero);
            setAbierto(false);
            setImporte('');
            setDetalle('');
            setCuentaId(null);
            await invalidar(qc, 'fondo');
          }}
        >
          <div className="grid grid-cols-[1fr_2fr] gap-3">
            <Campo label="Moneda">
              <select
                className={campo}
                value={moneda}
                onChange={(e) => {
                  setMoneda(e.target.value);
                  setCuentaId(null);
                }}
              >
                <option value="ARS">ARS</option>
                <option value="CLP">CLP</option>
                <option value="USD">USD</option>
              </select>
            </Campo>
            <Campo label="Cuánto necesitás">
              <input className={campo} inputMode="decimal" placeholder="0" value={importe} onChange={(e) => setImporte(e.target.value)} />
            </Campo>
          </div>
          <Campo label="Para qué es">
            <input
              className={campo}
              maxLength={500}
              placeholder="Ej. viaje a Santiago: peajes, comida y aduana"
              value={detalle}
              onChange={(e) => setDetalle(e.target.value)}
            />
          </Campo>
          {varias && (
            <div className="space-y-2 rounded-md border border-borde p-3">
              <p className="text-sm font-medium text-tinta">A qué cuenta te transferimos</p>
              <ElegirCuenta choferId={null} moneda={moneda} valor={cuentaId} onElegir={setCuentaId} grande />
            </div>
          )}
          {hayCuenta && (
            <div className="space-y-2 rounded-md border border-borde p-3">
              <p className="text-sm font-medium text-tinta">A qué cuenta te transferimos</p>
              {qCuenta.isPending ? (
                <p className="text-sm text-tinta-suave">Buscando tu cuenta…</p>
              ) : pedirCuenta ? (
                <CamposCuenta v={cuenta} onCambiar={(v) => setCuentaEscrita({ moneda, v })} moneda={moneda} clase={campo} />
              ) : (
                guardada && (
                  <p className="text-sm text-tinta">
                    {guardada.banco} · <span className="font-mono">{guardada.numero}</span> · {guardada.titular}{' '}
                    <button type="button" className="text-tinta-suave underline" onClick={() => setCuentaEscrita({ moneda, v: aTexto(guardada) })}>
                      Cambiar
                    </button>
                  </p>
                )
              )}
            </div>
          )}
          {error && <p className="text-sm text-error">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" className={cn(BOTON_PRIMARIO, 'h-12 flex-1 justify-center text-base')} disabled={ocupado || (hayCuenta && qCuenta.isPending)}>
              {ocupado ? <LoaderCircle className="size-5 animate-spin" /> : <Send className="size-5" />} Enviar pedido
            </button>
            <button type="button" className={cn(BOTON_SECUNDARIO, 'h-12')} disabled={ocupado} onClick={() => setAbierto(false)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        !enCurso &&
        !abierto &&
        trabas.length === 0 && (
          <button type="button" className={cn(BOTON_SECUNDARIO, 'h-12 w-full justify-center text-base')} onClick={() => { setHecho(null); setAbierto(true); }}>
            <HandCoins className="size-5" /> Pedir dinero
          </button>
        )
      )}
      {recientes.length > 0 && (
        <ul className="divide-y divide-borde text-sm">
          {recientes.map((p) => (
            <MiPedidoFila key={p.id} p={p} onCambio={() => invalidar(qc, 'fondo')} />
          ))}
        </ul>
      )}
      <p className="text-xs text-tinta-suave">Lo revisa Operaciones y lo autoriza Gerencia. Cuando te lo envían, aparece en tu fondo.</p>
    </section>
  );
}

function MiPedidoFila({ p, onCambio }: { p: MiPedido; onCambio: () => Promise<unknown> }) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const e = ESTADO_PEDIDO[p.estado];
  return (
    <li className="space-y-1 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium tabular-nums text-tinta">
          {dinero(p.importe, p.moneda)}
          {p.importeSolicitado !== p.importe && <span className="ml-1 text-xs font-normal text-tinta-suave">(pediste {dinero(p.importeSolicitado, p.moneda)})</span>}
        </span>
        <Chip tono={e.tono}>{e.texto}</Chip>
      </div>
      <p className="text-xs text-tinta-suave">
        {p.numero} · {p.detalle}
        {p.estado === 'depositado' && p.fechaDeposito && ` · enviado el ${formatearFechaDia(p.fechaDeposito)}`}
      </p>
      {p.motivo && <p className="text-xs text-error">Motivo: {p.motivo}</p>}
      {p.puedeAnular && (
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs text-tinta-suave underline"
          disabled={ocupado}
          onClick={async () => {
            setOcupado(true);
            setError(null);
            const r = await anularMiPedidoFondo({ pedidoId: p.id, motivo: 'Lo anuló el chofer' });
            setOcupado(false);
            if (!r.ok) return setError(r.error.mensaje);
            await onCambio();
          }}
        >
          <Ban className="size-3" /> Anular el pedido
        </button>
      )}
      {error && <p className="text-xs text-error">{error}</p>}
    </li>
  );
}
