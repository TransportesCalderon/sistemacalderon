'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invalidar } from '@/shared/query/invalidar';
import { Ban, Check, CircleAlert, ExternalLink, Landmark, LoaderCircle, Plus, Send, Wallet, X } from 'lucide-react';
import { AccionConMotivo, Cargando, Chip, Encabezado, ErrorLectura, Vacio, type Tono } from '@/modules/combustible/components/comun/ui';
import { useChoferesCombustible, useMonedas } from '@/modules/combustible/queries/hooks';
import { useSesion } from '@/modules/core/session/session-provider';
import type { ActionResult, ErrorAccion } from '@/server/actions/result';
import { cn } from '@/shared/lib/cn';
import { formatearFechaDia, formatearFechaHora, hoyEnZona } from '@/shared/lib/fechas';
import { browserDb } from '@/shared/supabase/browser';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { anularPedidoFondo, depositarPedidoFondo, pedirFondo, resolverPedidoFondo } from '../actions/pedido-fondo.actions';
import { dinero } from '../domain/chofer.types';
import { abrirArchivo, borrarArchivo, subirArchivo } from './archivos';

/** Migración 256 · Pedidos de FF Chofer: los piden Operaciones y Telemetría, aprueba el gerente, deposita Administración. */

type Estado = 'pendiente' | 'aprobado' | 'rechazado' | 'depositado' | 'anulado';
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
}
interface Datos {
  puede: { pedir: boolean; aprobar: boolean; depositar: boolean };
  pedidos: Pedido[];
}

const ETIQUETA: Record<Estado, string> = {
  pendiente: 'Para aprobar',
  aprobado: 'Aprobado · falta depositar',
  rechazado: 'Rechazado',
  depositado: 'Depositado',
  anulado: 'Anulado',
};
const TONO: Record<Estado, Tono> = { pendiente: 'alerta', aprobado: 'marca', rechazado: 'error', depositado: 'exito', anulado: 'neutro' };
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
      return { puede: d.puede, pedidos: (d.pedidos ?? []).map((p) => ({ ...p, importe: Number(p.importe) })) };
    },
  });
}

/** Liquidaciones › Fondos de choferes › Pedidos de FF. */
export function PedidosFondo() {
  const [todos, setTodos] = useState(false);
  const [nuevo, setNuevo] = useState(false);
  const q = usePedidos(todos);

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
        Operaciones o Telemetría piden el dinero del viaje, lo aprueba el gerente y Administración lo deposita (queda anotado en el fondo del chofer). No se
        aprueba si el chofer tiene cierres de viaje sin aprobar o sin el acta firmada.
      </p>
      {nuevo && <NuevoPedido onCerrar={() => setNuevo(false)} />}
      {q.isPending ? (
        <Cargando texto="Leyendo los pedidos…" />
      ) : q.isError ? (
        <ErrorLectura texto={q.error.message} onReintentar={() => void q.refetch()} />
      ) : q.data.pedidos.length === 0 ? (
        <Vacio icono={<Wallet className="size-6" />} texto={todos ? 'No hay pedidos en los últimos 120 días.' : 'No hay pedidos para aprobar ni para depositar.'} />
      ) : (
        <ul className="space-y-3">
          {q.data.pedidos.map((p) => (
            <FilaPedido key={p.id} p={p} puede={q.data.puede} />
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
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<ErrorAccion | null>(null);
  const [hecho, setHecho] = useState<{ numero: string; cierresPendientes: number } | null>(null);

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
        const r = await pedirFondo({ choferId: Number(chofer) || 0, moneda, importe: aNumero(importe), detalle });
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
          <select className={campo} value={chofer} onChange={(e) => setChofer(e.target.value)}>
            <option value="">Elegí…</option>
            {choferes.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Moneda *">
          <select className={campo} value={moneda} onChange={(e) => setMoneda(e.target.value)}>
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

function FilaPedido({ p, puede }: { p: Pedido; puede: Datos['puede'] }) {
  const { zonaHoraria } = useSesion();
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
  const trabado = p.estado === 'pendiente' && p.cierres.length > 0;

  return (
    <li className={cn(TARJETA, 'space-y-2 p-4', p.estado === 'pendiente' && 'border-l-4 border-l-alerta', p.estado === 'aprobado' && 'border-l-4 border-l-marca')}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold text-tinta">
          {p.numero} · {p.chofer}
          {p.patente && <span className="ml-1 font-mono text-sm font-normal text-tinta-suave">{p.patente}</span>}
        </p>
        <Chip tono={TONO[p.estado]}>{ETIQUETA[p.estado]}</Chip>
      </div>
      <p className="text-2xl font-semibold text-tinta tabular-nums">{dinero(p.importe, p.moneda)}</p>
      <p className="text-sm text-tinta">{p.detalle}</p>
      <p className="text-xs text-tinta-suave">
        Pedido por {p.pedido_por ?? '—'} el {formatearFechaHora(p.pedido_en, zonaHoraria)}
        {p.resuelto_por && p.resuelto_en && p.estado !== 'pendiente' && (
          <>
            {' · '}
            {p.estado === 'rechazado' ? 'Rechazado' : p.estado === 'anulado' ? 'Anulado' : 'Aprobado'} por {p.resuelto_por} el{' '}
            {formatearFechaHora(p.resuelto_en, zonaHoraria)}
          </>
        )}
        {p.estado === 'depositado' && p.depositado_por && (
          <>
            {' · '}Depositado por {p.depositado_por}
            {p.fecha_deposito ? ` el ${formatearFechaDia(p.fecha_deposito)}` : ''}
          </>
        )}
      </p>
      {p.motivo && (p.estado === 'rechazado' || p.estado === 'anulado') && <p className="text-sm text-error">Motivo: {p.motivo}</p>}
      {trabado && (
        <div className="rounded-md bg-alerta-suave p-3 text-sm text-alerta">
          <p className="font-semibold">No se puede aprobar: el chofer tiene cierres de viaje pendientes</p>
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
        {p.estado === 'pendiente' && puede.aprobar && (
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
        {p.estado === 'aprobado' && puede.depositar && <Depositar p={p} onHecho={recargar} />}
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
