'use client';

import { useDeferredValue, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invalidar } from '@/shared/query/invalidar';
import { ArrowUpRight, Ban, Check, CircleAlert, ExternalLink, Landmark, LoaderCircle, Plus, Send, Wallet, X } from 'lucide-react';
import { AccionConMotivo, Cargando, Chip, Encabezado, ErrorLectura, Vacio, type Tono } from '@/modules/combustible/components/comun/ui';
import { useChoferesCombustible, useMonedas } from '@/modules/combustible/queries/hooks';
import { useSesion } from '@/modules/core/session/session-provider';
import type { ActionResult, ErrorAccion } from '@/server/actions/result';
import { cn } from '@/shared/lib/cn';
import { formatearFechaDia, formatearFechaHora, hoyEnZona } from '@/shared/lib/fechas';
import { browserDb } from '@/shared/supabase/browser';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import {
  anularPedidoFondo,
  autorizarPedidoFondo,
  depositarPedidoFondo,
  pagarPedidoFondo,
  pedirFondo,
  resolverPedidoFondo,
  revisarPedidoFondo,
} from '../actions/pedido-fondo.actions';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { parsearCuentasDePedidos, type CuentaTransferencia } from '../domain/cuenta-transferencia';
import { CuentaDestino } from './cuenta-transferencia';
import { CambiarCuentaPedido, ElegirCuenta } from './cuentas-varias';
import { parsearTrabasDePedidos, type TrabaPedido } from '../domain/trabas-pedido';
import { parsearAnalisisDePedidos, parsearAnalisisTope, type AnalisisTope } from '../domain/tope-fondo';
import { AnalisisTopeFondo } from './analisis-tope';
import { dinero } from '../domain/chofer.types';
import { abrirArchivo, borrarArchivo, subirArchivo } from './archivos';

/**
 * Migración 256 · Pedidos de FF Chofer. Migración 278: el chofer pide desde su perfil, Operaciones revisa y eleva,
 * y quien tiene «Aprueba fondos» autoriza el monto y deja registrado el pago (cuenta y medio), así el saldo de la cuenta es el real.
 */

type Estado = 'solicitado' | 'pendiente' | 'aprobado' | 'rechazado' | 'depositado' | 'anulado';
type Medio = 'transferencia' | 'deposito' | 'efectivo';
interface CuentaPago {
  id: number;
  nombre: string;
  tipo: 'banco' | 'caja';
  moneda: string;
}
interface CierrePendiente {
  id: number;
  numero: string;
  patente: string;
  motivo: 'sin aprobar' | 'sin firmar';
}
interface Pedido {
  id: number;
  numero: string;
  estado: Estado;
  chofer_id: number;
  chofer: string;
  legajo: string | null;
  patente: string | null;
  moneda: string;
  importe: number;
  detalle: string;
  pedido_por: string | null;
  pedido_en: string;
  resuelto_por: string | null;
  resuelto_en: string | null;
  motivo: string | null;
  depositado_por: string | null;
  fecha_deposito: string | null;
  comprobante_ruta: string | null;
  comprobante_nombre: string | null;
  cierres: CierrePendiente[];
  puede_anular: boolean;
  // Migración 278
  importe_solicitado?: number | null;
  pedido_por_chofer?: boolean;
  elevado_por?: string | null;
  nota_revision?: string | null;
  medio_pago?: Medio | null;
  cuenta?: string | null;
  monto_cuenta?: number | null;
}
interface Datos {
  puede: { pedir: boolean; aprobar: boolean; depositar: boolean; revisar?: boolean };
  pedidos: Pedido[];
  cuentas: CuentaPago[];
}

const ETIQUETA: Record<Estado, string> = {
  solicitado: 'Para revisar (Operaciones)',
  pendiente: 'Para autorizar',
  aprobado: 'Autorizado · falta registrar el pago',
  rechazado: 'Rechazado',
  depositado: 'Pagado',
  anulado: 'Anulado',
};
const TONO: Record<Estado, Tono> = { solicitado: 'alerta', pendiente: 'alerta', aprobado: 'marca', rechazado: 'error', depositado: 'exito', anulado: 'neutro' };
const MEDIO: Record<Medio, string> = { transferencia: 'transferencia', deposito: 'depósito', efectivo: 'efectivo' };
const CLAVE = ['chofer', 'pedidos-fondo'] as const;

const aNumero = (s: string) => {
  const t = s.trim().replace(/\./g, '').replace(',', '.');
  return t === '' ? NaN : Number(t);
};

function usePedidos(todos: boolean) {
  return useQuery({
    queryKey: [...CLAVE, todos] as const,
    refetchInterval: 60_000,
    queryFn: async (): Promise<Datos> => {
      const { data, error } = await browserDb().schema('fin').rpc('fn_pedidos_fondo', { p_todos: todos });
      if (error) throw error;
      const d = data as unknown as Datos;
      return {
        puede: d.puede,
        cuentas: Array.isArray(d.cuentas) ? d.cuentas : [],
        pedidos: (d.pedidos ?? []).map((p) => ({
          ...p,
          importe: Number(p.importe),
          importe_solicitado: p.importe_solicitado === null || p.importe_solicitado === undefined ? null : Number(p.importe_solicitado),
          monto_cuenta: p.monto_cuenta === null || p.monto_cuenta === undefined ? null : Number(p.monto_cuenta),
        })),
      };
    },
  });
}

/** Migración 284: la cuenta a transferir de cada pedido sin pagar. */
function useCuentasDestino() {
  const hay = useBaseTiene(284);
  return useQuery({
    queryKey: [...CLAVE, 'cuentas-destino'] as const,
    enabled: hay,
    queryFn: async () => {
      const { data, error } = await browserDb().schema('fin').rpc('fn_cuentas_destino_pedidos');
      if (error) throw error;
      return parsearCuentasDePedidos(data);
    },
  });
}

/** Migración 285: qué le falta al chofer de cada pedido sin pagar (gastos sin subir, tareas). */
function useTrabasDePedidos() {
  const hay = useBaseTiene(285);
  return useQuery({
    queryKey: [...CLAVE, 'trabas'] as const,
    enabled: hay,
    refetchInterval: 120_000,
    queryFn: async () => {
      const { data, error } = await browserDb().schema('fin').rpc('fn_trabas_de_pedidos');
      if (error) throw error;
      return parsearTrabasDePedidos(data);
    },
  });
}

const FUNCION_INEXISTENTE = new Set(['PGRST202', '42883']);

/** Migración 386: el análisis de Iris guardado en cada pedido sin pagar (el de cuando se pidió). */
function useAnalisisDePedidos() {
  return useQuery({
    queryKey: [...CLAVE, 'analisis'] as const,
    refetchInterval: 120_000,
    queryFn: async () => {
      const { data, error } = await browserDb().schema('fin').rpc('fn_analisis_de_pedidos');
      if (error) {
        if (FUNCION_INEXISTENTE.has(error.code ?? '')) return {};
        throw error;
      }
      return parsearAnalisisDePedidos(data);
    },
  });
}

/** Migración 386: el análisis de un chofer al pedir por él (con el monto que se va escribiendo). */
function useTopeChofer(choferId: number, moneda: string, importe: number) {
  return useQuery({
    queryKey: [...CLAVE, 'tope', choferId, moneda, importe] as const,
    enabled: choferId > 0,
    staleTime: 30_000,
    placeholderData: (anterior) => anterior,
    queryFn: async () => {
      const { data, error } = await browserDb()
        .schema('fin')
        .rpc('fn_tope_fondo_chofer', { p_chofer: choferId, p_moneda: moneda, p_importe: importe > 0 ? importe : 0 });
      if (error) {
        if (FUNCION_INEXISTENTE.has(error.code ?? '')) return null;
        throw error;
      }
      return parsearAnalisisTope(data);
    },
  });
}

/** Liquidaciones › Fondos de choferes › Pedidos de FF. */
export function PedidosFondo() {
  const [todos, setTodos] = useState(false);
  const [nuevo, setNuevo] = useState(false);
  const q = usePedidos(todos);
  const destinos = useCuentasDestino();
  const trabas = useTrabasDePedidos();
  const analisis = useAnalisisDePedidos();

  return (
    <div className="space-y-5">
      <Encabezado titulo="Pedidos de FF Chofer" subtitulo="Administración">
        {q.data?.puede.pedir && !nuevo && (
          <button type="button" className={BOTON_PRIMARIO} onClick={() => setNuevo(true)}>
            <Plus className="size-4" /> Pedir FF
          </button>
        )}
      </Encabezado>
      <p className="text-sm text-tinta-suave">
        El chofer pide el dinero del viaje desde su perfil (u Operaciones lo pide por él). Operaciones lo revisa y lo eleva; quien tiene «Aprueba fondos»
        autoriza el monto y elige de qué cuenta sale: queda anotado en el fondo del chofer y como egreso de esa cuenta. No se autoriza si el chofer tiene
        cierres de viaje sin aprobar o sin el acta firmada. El chofer tampoco puede pedir si lo que tiene sin rendir supera lo que lleva generado de sueldo
        en mano (lo analiza Iris); Operaciones sí puede pedir por él y el pedido queda con el análisis.
      </p>
      {nuevo && <NuevoPedido onCerrar={() => setNuevo(false)} />}
      {q.isPending ? (
        <Cargando texto="Leyendo los pedidos…" />
      ) : q.isError ? (
        <ErrorLectura texto={q.error.message} onReintentar={() => void q.refetch()} />
      ) : q.data.pedidos.length === 0 ? (
        <Vacio icono={<Wallet className="size-6" />} texto={todos ? 'No hay pedidos en los últimos 120 días.' : 'No hay pedidos para revisar, autorizar ni pagar.'} />
      ) : (
        <ul className="space-y-3">
          {q.data.pedidos.map((p) => (
            <FilaPedido key={p.id} p={p} puede={q.data.puede} cuentas={q.data.cuentas} destino={destinos.data ? (destinos.data[p.id] ?? null) : undefined} trabas={trabas.data?.[p.id]} analisis={analisis.data?.[p.id]} />
          ))}
        </ul>
      )}
      <label className="flex items-center gap-2 text-sm text-tinta-suave">
        <input type="checkbox" className="size-4 accent-marca" checked={todos} onChange={(e) => setTodos(e.target.checked)} />
        Ver también los depositados, rechazados y anulados (últimos 120 días)
      </label>
    </div>
  );
}

function NuevoPedido({ onCerrar }: { onCerrar: () => void }) {
  const qc = useQueryClient();
  const choferes = useChoferesCombustible();
  const monedas = useMonedas();
  const [chofer, setChofer] = useState('');
  const [moneda, setMoneda] = useState('ARS');
  const [importe, setImporte] = useState('');
  const [detalle, setDetalle] = useState('');
  // Migración 303: a cuál de las cuentas del chofer (null = la principal)
  const varias = useBaseTiene(303);
  const [cuentaId, setCuentaId] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<ErrorAccion | null>(null);
  const [hecho, setHecho] = useState<{ numero: string; cierresPendientes: number } | null>(null);
  const importeDiferido = aNumero(useDeferredValue(importe));
  const tope = useTopeChofer(Number(chofer) || 0, moneda, Number.isFinite(importeDiferido) ? importeDiferido : 0);

  if (hecho)
    return (
      <div className={cn(TARJETA, 'space-y-2 p-4')}>
        <p className="flex items-center gap-2 font-semibold text-exito">
          <Check className="size-5" /> Pedido {hecho.numero} enviado para aprobar.
        </p>
        {hecho.cierresPendientes > 0 && (
          <p className="text-sm text-alerta">
            Ojo: el chofer tiene {hecho.cierresPendientes === 1 ? '1 cierre de viaje pendiente' : `${hecho.cierresPendientes} cierres de viaje pendientes`}{' '}
            (sin aprobar o sin firmar). Hasta que se resuelvan no se puede aprobar.
          </p>
        )}
        <button type="button" className={BOTON_SECUNDARIO} onClick={onCerrar}>
          Cerrar
        </button>
      </div>
    );

  const campo = 'h-11 w-full rounded-md border border-borde bg-panel px-3 text-base';
  return (
    <form
      className={cn(TARJETA, 'space-y-3 p-4')}
      onSubmit={async (e) => {
        e.preventDefault();
        setOcupado(true);
        setError(null);
        const r = await pedirFondo({ choferId: Number(chofer) || 0, moneda, importe: aNumero(importe), detalle, ...(varias ? { cuentaId } : {}) });
        setOcupado(false);
        if (!r.ok) return setError(r.error);
        await invalidar(qc, 'fondo');
        setHecho(r.data);
      }}
    >
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-tinta">Pedir FF Chofer</h2>
        <button type="button" aria-label="Cerrar" className="rounded p-1 text-tinta-suave hover:bg-hover" onClick={onCerrar}>
          <X className="size-4" />
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
        <Campo label="Chofer *">
          <select
            className={campo}
            value={chofer}
            onChange={(e) => {
              setChofer(e.target.value);
              setCuentaId(null);
            }}
          >
            <option value="">Elegí…</option>
            {choferes.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Moneda *">
          <select
            className={campo}
            value={moneda}
            onChange={(e) => {
              setMoneda(e.target.value);
              setCuentaId(null);
            }}
          >
            {(monedas.data ?? [{ codigo: 'ARS', nombre: 'Peso argentino' }]).map((m) => (
              <option key={m.codigo} value={m.codigo}>
                {m.codigo}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Importe *">
          <input className={campo} inputMode="decimal" placeholder="0" value={importe} onChange={(e) => setImporte(e.target.value)} />
        </Campo>
      </div>
      <Campo label="Para qué es *">
        <input
          className={campo}
          maxLength={500}
          placeholder="Ej. viaje Mendoza → San Antonio, peajes y comida"
          value={detalle}
          onChange={(e) => setDetalle(e.target.value)}
        />
      </Campo>
      {varias && Number(chofer) > 0 && (
        <div className="space-y-2 rounded-md border border-borde p-3">
          <p className="text-sm font-medium text-tinta">A qué cuenta del chofer se transfiere</p>
          <ElegirCuenta choferId={Number(chofer)} moneda={moneda} valor={cuentaId} onElegir={setCuentaId} />
        </div>
      )}
      {Number(chofer) > 0 && tope.data && (
        <div className="space-y-1">
          <AnalisisTopeFondo a={tope.data} para="oficina" />
          {tope.data.estado === 'pasado' && (
            <p className="text-xs text-tinta-suave">Operaciones puede pedirlo igual: el pedido queda con este análisis para quien lo autoriza.</p>
          )}
        </div>
      )}
      {error && (
        <p className="flex items-start gap-2 text-sm text-error">
          <CircleAlert className="mt-0.5 size-4 shrink-0" /> {error.mensaje}
        </p>
      )}
      <button type="submit" className={cn(BOTON_PRIMARIO, 'h-11 w-full justify-center sm:w-auto')} disabled={ocupado}>
        {ocupado ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />} Enviar para aprobar
      </button>
    </form>
  );
}

function FilaPedido({
  p,
  puede,
  cuentas,
  destino,
  trabas,
  analisis,
}: {
  p: Pedido;
  puede: Datos['puede'];
  cuentas: CuentaPago[];
  /** undefined = la base todavía no lo tiene o se está leyendo. */
  destino?: CuentaTransferencia | null;
  /** Migración 285: lo que le falta al chofer (a él le frena pedir; acá es un aviso para decidir). */
  trabas?: TrabaPedido[];
  /** Migración 386: el análisis de Iris de cuando se pidió (solo los pedidos sin pagar). */
  analisis?: AnalisisTope;
}) {
  const { zonaHoraria } = useSesion();
  const nuevo = useBaseTiene(278);
  const varias = useBaseTiene(303);
  const qc = useQueryClient();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<ErrorAccion | null>(null);
  const recargar = () => invalidar(qc, 'fondo');
  const correr = async (accion: () => Promise<ActionResult<unknown>>) => {
    setOcupado(true);
    setError(null);
    const r = await accion();
    setOcupado(false);
    if (!r.ok) {
      setError(r.error);
      return false;
    }
    await recargar();
    return true;
  };
  const trabado = (p.estado === 'pendiente' || p.estado === 'solicitado') && p.cierres.length > 0;

  return (
    <li className={cn(TARJETA, 'space-y-2 p-4', (p.estado === 'pendiente' || p.estado === 'solicitado') && 'border-l-4 border-l-alerta', p.estado === 'aprobado' && 'border-l-4 border-l-marca')}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold text-tinta">
          {p.numero} · {p.chofer}
          {p.patente && <span className="ml-1 font-mono text-sm font-normal text-tinta-suave">{p.patente}</span>}
        </p>
        <Chip tono={TONO[p.estado]}>{ETIQUETA[p.estado]}</Chip>
      </div>
      <p className="text-2xl font-semibold text-tinta tabular-nums">
        {dinero(p.importe, p.moneda)}
        {p.importe_solicitado !== null && p.importe_solicitado !== undefined && p.importe_solicitado !== p.importe && (
          <span className="ml-2 text-sm font-normal text-tinta-suave">(pidió {dinero(p.importe_solicitado, p.moneda)})</span>
        )}
      </p>
      <p className="text-sm text-tinta">{p.detalle}</p>
      {trabas && trabas.length > 0 && (
        <div className="rounded-md border border-alerta/40 bg-alerta/10 px-3 py-2 text-sm text-tinta">
          <p className="font-medium">El chofer no está al día. El sistema le pide:</p>
          <ul className="list-disc pl-5">
            {trabas.map((t, i) => (
              <li key={i}>{t.texto}</li>
            ))}
          </ul>
        </div>
      )}
      {analisis && (p.estado === 'solicitado' || p.estado === 'pendiente' || p.estado === 'aprobado') && (
        <AnalisisTopeFondo a={analisis} para="oficina" />
      )}
      {destino !== undefined && (p.estado === 'solicitado' || p.estado === 'pendiente' || p.estado === 'aprobado') && (
        <CuentaDestino
          cuenta={destino}
          choferId={p.chofer_id}
          moneda={p.moneda}
          puedeEditar={puede.pedir || puede.aprobar || puede.depositar}
          onCambio={recargar}
        />
      )}
      {/* Migración 303: pasar el pedido a otra cuenta del chofer */}
      {varias && destino !== undefined && (puede.pedir || puede.aprobar || puede.depositar) && (p.estado === 'solicitado' || p.estado === 'pendiente' || p.estado === 'aprobado') && (
        <CambiarCuentaPedido pedidoId={p.id} choferId={p.chofer_id} moneda={p.moneda} actual={destino?.id ?? null} onCambio={recargar} />
      )}
      {p.nota_revision && <p className="text-sm text-tinta-suave">Operaciones ({p.elevado_por ?? '—'}): {p.nota_revision}</p>}
      {p.estado === 'depositado' && p.medio_pago && (
        <p className="text-sm text-tinta-suave">
          Pagado por {MEDIO[p.medio_pago]}
          {p.cuenta && ` desde ${p.cuenta}`}
          {p.monto_cuenta !== null && p.monto_cuenta !== undefined && ` (salieron ${formatearNumeroSimple(p.monto_cuenta)} de la cuenta)`}
        </p>
      )}
      <p className="text-xs text-tinta-suave">
        Pedido por {p.pedido_por ?? '—'}{p.pedido_por_chofer ? ' (desde su perfil)' : ''} el {formatearFechaHora(p.pedido_en, zonaHoraria)}
        {p.resuelto_por && p.resuelto_en && p.estado !== 'pendiente' && p.estado !== 'solicitado' && (
          <>
            {' · '}
            {p.estado === 'rechazado' ? 'Rechazado' : p.estado === 'anulado' ? 'Anulado' : 'Autorizado'} por {p.resuelto_por} el{' '}
            {formatearFechaHora(p.resuelto_en, zonaHoraria)}
          </>
        )}
        {p.estado === 'depositado' && p.depositado_por && (
          <>
            {' · '}Pago registrado por {p.depositado_por}
            {p.fecha_deposito ? ` el ${formatearFechaDia(p.fecha_deposito)}` : ''}
          </>
        )}
      </p>
      {p.motivo && (p.estado === 'rechazado' || p.estado === 'anulado') && <p className="text-sm text-error">Motivo: {p.motivo}</p>}
      {trabado && (
        <div className="rounded-md bg-alerta-suave p-3 text-sm text-alerta">
          <p className="font-semibold">No se puede autorizar: el chofer tiene cierres de viaje pendientes</p>
          <ul className="mt-1 list-disc pl-5">
            {p.cierres.map((c) => (
              <li key={c.id}>
                <a href={`/combustible/cierres/${c.id}`} className="underline">
                  {c.numero}
                </a>{' '}
                · {c.patente} · {c.motivo}
              </li>
            ))}
          </ul>
        </div>
      )}
      {p.comprobante_ruta && (
        <button
          type="button"
          className="inline-flex items-center gap-1 text-sm text-marca hover:underline"
          onClick={async () => {
            const e = await abrirArchivo(p.comprobante_ruta!);
            if (e) setError({ codigo: 'desconocido', mensaje: e });
          }}
        >
          <ExternalLink className="size-3.5" /> Comprobante{p.comprobante_nombre ? ` (${p.comprobante_nombre})` : ''}
        </button>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        {/* Migración 278: Operaciones revisa lo que pidió el chofer */}
        {p.estado === 'solicitado' && puede.revisar && (
          <>
            <AccionConMotivo
              etiqueta="Elevar para autorizar"
              icono={<ArrowUpRight className="size-4" />}
              titulo={`Elevar ${p.numero}`}
              explicacion="Le llega el aviso a quien autoriza fondos. Podés dejarle una nota (por ejemplo, qué viaje hace)."
              motivoOpcional
              primario
              ocupado={ocupado}
              error={error}
              onConfirmar={(nota) => correr(() => revisarPedidoFondo({ pedidoId: p.id, elevar: true, nota: nota || null }))}
            />
            <AccionConMotivo
              etiqueta="Rechazar"
              icono={<X className="size-4" />}
              titulo={`Rechazar ${p.numero}`}
              explicacion="Le avisa al chofer, con el motivo."
              ocupado={ocupado}
              error={error}
              onConfirmar={(motivo) => correr(() => revisarPedidoFondo({ pedidoId: p.id, elevar: false, nota: motivo }))}
            />
          </>
        )}
        {p.estado === 'pendiente' && puede.aprobar && nuevo && (
          <>
            <Pagar p={p} cuentas={cuentas} autorizar trabado={trabado} onHecho={recargar} />
            <AccionConMotivo
              etiqueta="Rechazar"
              icono={<X className="size-4" />}
              titulo={`Rechazar ${p.numero}`}
              explicacion="Le avisa a quien lo pidió, con el motivo."
              ocupado={ocupado}
              error={error}
              onConfirmar={(motivo) => correr(() => resolverPedidoFondo({ pedidoId: p.id, aprobar: false, motivo }))}
            />
          </>
        )}
        {p.estado === 'pendiente' && puede.aprobar && !nuevo && (
          <>
            <button
              type="button"
              className={BOTON_PRIMARIO}
              disabled={ocupado || trabado}
              title={trabado ? 'Primero hay que aprobar los cierres y subir el acta firmada' : undefined}
              onClick={() => void correr(() => resolverPedidoFondo({ pedidoId: p.id, aprobar: true, motivo: null }))}
            >
              {ocupado ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} Aprobar
            </button>
            <AccionConMotivo
              etiqueta="Rechazar"
              icono={<X className="size-4" />}
              titulo={`Rechazar ${p.numero}`}
              explicacion="Le avisa a quien lo pidió, con el motivo."
              ocupado={ocupado}
              error={error}
              onConfirmar={(motivo) => correr(() => resolverPedidoFondo({ pedidoId: p.id, aprobar: false, motivo }))}
            />
          </>
        )}
        {p.estado === 'aprobado' && nuevo && (puede.aprobar || puede.depositar) && <Pagar p={p} cuentas={cuentas} onHecho={recargar} />}
        {p.estado === 'aprobado' && !nuevo && puede.depositar && <Depositar p={p} onHecho={recargar} />}
        {p.puede_anular && (
          <AccionConMotivo
            etiqueta="Anular"
            icono={<Ban className="size-4" />}
            titulo={`Anular ${p.numero}`}
            explicacion="Por ejemplo, si se pidió dos veces o el viaje se suspendió."
            ocupado={ocupado}
            error={error}
            onConfirmar={(motivo) => correr(() => anularPedidoFondo({ pedidoId: p.id, motivo }))}
          />
        )}
      </div>
      {error && <p className="text-sm text-error">{error.mensaje}</p>}
    </li>
  );
}

/** Administración: fecha del depósito y comprobante (opcional). Se anota como entrega en el fondo del chofer. */
function Depositar({ p, onHecho }: { p: Pedido; onHecho: () => Promise<unknown> }) {
  const { zonaHoraria } = useSesion();
  const [abierto, setAbierto] = useState(false);
  const [fecha, setFecha] = useState<string>(hoyEnZona(zonaHoraria));
  const [archivo, setArchivo] = useState<File | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!abierto)
    return (
      <button type="button" className={BOTON_PRIMARIO} onClick={() => setAbierto(true)}>
        <Landmark className="size-4" /> Marcar depositado
      </button>
    );

  return (
    <div className="w-full space-y-2 rounded-md border border-borde bg-fondo p-3">
      <p className="text-sm text-tinta">
        Se anota una entrega de <strong>{dinero(p.importe, p.moneda)}</strong> en el fondo de {p.chofer}.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-xs text-tinta-suave">
          Fecha del depósito
          <input type="date" className="block h-10 rounded-md border border-borde bg-panel px-2 text-sm" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </label>
        <label className="space-y-1 text-xs text-tinta-suave">
          Comprobante (opcional)
          <input
            type="file"
            accept="application/pdf,image/*"
            className="block text-sm"
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>
      {error && <p className="text-sm text-error">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          className={BOTON_PRIMARIO}
          disabled={ocupado}
          onClick={async () => {
            setOcupado(true);
            setError(null);
            let ruta: string | null = null;
            let nombre: string | null = null;
            try {
              if (archivo) {
                const s = await subirArchivo(archivo, `fondos/${p.id}`);
                ruta = s.ruta;
                nombre = s.nombre;
              }
              const r = await depositarPedidoFondo({ pedidoId: p.id, fecha, ruta, nombre });
              if (!r.ok) {
                await borrarArchivo(ruta);
                setError(r.error.mensaje);
                return;
              }
              await onHecho();
            } catch (e) {
              await borrarArchivo(ruta);
              setError(e instanceof Error ? e.message : 'No se pudo marcar el depósito.');
            } finally {
              setOcupado(false);
            }
          }}
        >
          {ocupado ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} Confirmar depósito
        </button>
        <button type="button" className={BOTON_SECUNDARIO} disabled={ocupado} onClick={() => setAbierto(false)}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

const formatearNumeroSimple = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 2 });

/**
 * Migración 278 · Autorizar (con el monto, que puede ser otro) y registrar el pago: medio, cuenta de donde sale la plata,
 * fecha y, si la cuenta es de otra moneda, cuánto salió de la cuenta. Queda la entrega en el fondo del chofer y el egreso de la cuenta.
 */
function Pagar({
  p,
  cuentas,
  autorizar = false,
  trabado = false,
  onHecho,
}: {
  p: Pedido;
  cuentas: CuentaPago[];
  autorizar?: boolean;
  trabado?: boolean;
  onHecho: () => Promise<unknown>;
}) {
  const { zonaHoraria } = useSesion();
  const [abierto, setAbierto] = useState(false);
  const [importe, setImporte] = useState(String(p.importe).replace('.', ','));
  const [medio, setMedio] = useState<Medio>('transferencia');
  const [cuentaId, setCuentaId] = useState<number | null>(null);
  const [fecha, setFecha] = useState<string>(hoyEnZona(zonaHoraria));
  const [montoCuenta, setMontoCuenta] = useState('');
  const [nota, setNota] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!abierto)
    return (
      <button
        type="button"
        className={BOTON_PRIMARIO}
        disabled={trabado}
        title={trabado ? 'Primero hay que aprobar los cierres y subir el acta firmada' : undefined}
        onClick={() => setAbierto(true)}
      >
        {autorizar ? <Check className="size-4" /> : <Landmark className="size-4" />} {autorizar ? 'Autorizar y pagar' : 'Registrar el pago'}
      </button>
    );

  const posibles = cuentas.filter((c) => (medio === 'efectivo' ? c.tipo === 'caja' : c.tipo !== 'caja'));
  const cuenta = posibles.find((c) => c.id === cuentaId) ?? null;
  const otraMoneda = cuenta !== null && cuenta.moneda !== p.moneda;
  const campo = 'block h-10 w-full rounded-md border border-borde bg-panel px-2 text-sm';

  return (
    <div className="w-full space-y-3 rounded-md border border-borde bg-fondo p-3">
      <p className="text-sm text-tinta">
        {autorizar ? 'Autorizás el monto y elegís de dónde sale la plata.' : 'Elegí de dónde salió la plata.'} Queda anotada la entrega en el fondo de {p.chofer} y
        el egreso de la cuenta.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {autorizar && (
          <label className="space-y-1 text-xs text-tinta-suave">
            Monto que se autoriza ({p.moneda})
            <input className={campo} inputMode="decimal" value={importe} onChange={(e) => setImporte(e.target.value)} />
          </label>
        )}
        <label className="space-y-1 text-xs text-tinta-suave">
          Medio de pago
          <select
            className={campo}
            value={medio}
            onChange={(e) => {
              setMedio(e.target.value as Medio);
              setCuentaId(null);
            }}
          >
            <option value="transferencia">Transferencia</option>
            <option value="deposito">Depósito</option>
            <option value="efectivo">Efectivo</option>
          </select>
        </label>
        <label className="space-y-1 text-xs text-tinta-suave">
          {medio === 'efectivo' ? 'Caja de donde sale' : 'Cuenta de donde sale'}
          <select className={campo} value={cuentaId ?? ''} onChange={(e) => setCuentaId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Elegí…</option>
            {posibles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} ({c.moneda})
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs text-tinta-suave">
          Fecha del pago
          <input type="date" className={campo} value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </label>
        {otraMoneda && (
          <label className="space-y-1 text-xs text-tinta-suave">
            Cuánto salió de la cuenta ({cuenta?.moneda})
            <input className={campo} inputMode="decimal" placeholder="0" value={montoCuenta} onChange={(e) => setMontoCuenta(e.target.value)} />
          </label>
        )}
        <label className="space-y-1 text-xs text-tinta-suave">
          Comprobante (opcional)
          <input type="file" accept="application/pdf,image/*" className="block text-sm" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
        </label>
        {autorizar && (
          <label className="space-y-1 text-xs text-tinta-suave sm:col-span-2">
            Nota (opcional)
            <input className={campo} maxLength={500} value={nota} onChange={(e) => setNota(e.target.value)} />
          </label>
        )}
      </div>
      {posibles.length === 0 && <p className="text-sm text-alerta">No hay {medio === 'efectivo' ? 'cajas' : 'bancos'} cargados en Finanzas › Bancos.</p>}
      {error && <p className="text-sm text-error">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          className={BOTON_PRIMARIO}
          disabled={ocupado || cuentaId === null}
          onClick={async () => {
            setOcupado(true);
            setError(null);
            let ruta: string | null = null;
            let nombre: string | null = null;
            try {
              if (archivo) {
                const s = await subirArchivo(archivo, `fondos/${p.id}`);
                ruta = s.ruta;
                nombre = s.nombre;
              }
              const base = {
                pedidoId: p.id,
                cuentaId: cuentaId ?? 0,
                medio,
                fecha,
                montoCuenta: otraMoneda ? aNumero(montoCuenta) || null : null,
                ruta,
                nombre,
              };
              const r = autorizar
                ? await autorizarPedidoFondo({ ...base, importe: aNumero(importe), nota: nota.trim() || null })
                : await pagarPedidoFondo(base);
              if (!r.ok) {
                await borrarArchivo(ruta);
                setError(r.error.mensaje);
                return;
              }
              await onHecho();
            } catch (e) {
              await borrarArchivo(ruta);
              setError(e instanceof Error ? e.message : 'No se pudo registrar el pago.');
            } finally {
              setOcupado(false);
            }
          }}
        >
          {ocupado ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} {autorizar ? 'Autorizar y registrar el pago' : 'Registrar el pago'}
        </button>
        <button type="button" className={BOTON_SECUNDARIO} disabled={ocupado} onClick={() => setAbierto(false)}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
