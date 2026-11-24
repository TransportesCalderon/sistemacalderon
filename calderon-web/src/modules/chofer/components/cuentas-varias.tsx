'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Landmark, LoaderCircle, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { invalidar } from '@/shared/query/invalidar';
import { cn } from '@/shared/lib/cn';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from '@/shared/ui/clases';
import { elegirCuentaPedido, guardarCuentaTransferenciaChofer, guardarMiCuentaTransferencia, quitarCuentaTransferencia } from '../actions/cuenta-transferencia.actions';
import { aTexto, CUENTA_VACIA, cuentaParaCopiar, MONEDAS_CUENTA, type CuentaTransferencia, type CuentaTransferenciaTexto } from '../domain/cuenta-transferencia';
import { CamposCuenta, cuentaCompleta } from './cuenta-transferencia';
import { useCuentasTransferencia } from './use-cuentas';

/**
 * Migración 303 · Varias cuentas por chofer (Global66, Mercado Pago, un banco…): una es la principal de cada moneda.
 * choferId null = las mías (el chofer en su perfil); con número = las de ese chofer (oficina y ficha de Flota).
 */
type Guardar = CuentaTransferenciaTexto & { moneda: string; id?: number | null; nueva?: boolean; principal?: boolean };
async function guardar(choferId: number | null, d: Guardar) {
  return choferId === null ? guardarMiCuentaTransferencia(d) : guardarCuentaTransferenciaChofer({ ...d, choferId });
}

/** La lista de cuentas con «Agregar», «Cambiar», «Principal» y «Quitar». */
export function ListaCuentas({
  choferId,
  puedeEditar,
  ocultarSinPermiso = false,
  grande = false,
}: {
  choferId: number | null;
  puedeEditar: boolean;
  ocultarSinPermiso?: boolean;
  grande?: boolean;
}) {
  const qc = useQueryClient();
  const q = useCuentasTransferencia(choferId);
  const [agregando, setAgregando] = useState(false);
  const recargar = () => invalidar(qc, 'fondo');
  if (q.isPending) return <p className="text-sm text-tinta-suave">Buscando las cuentas…</p>;
  if (q.isError) return ocultarSinPermiso ? null : <p className="text-sm text-error">{q.error.message}</p>;
  const cuentas = q.data;
  return (
    <div className="space-y-2">
      {cuentas.length === 0 && !agregando && (
        <p className="text-sm text-tinta-suave">{choferId === null ? 'Todavía no cargaste ninguna cuenta.' : 'El chofer todavía no tiene cuentas cargadas.'}</p>
      )}
      <ul className="space-y-2">
        {cuentas.map((c) => (
          <FilaCuenta key={c.id ?? `${c.moneda}-${c.numero}`} c={c} choferId={choferId} puedeEditar={puedeEditar} grande={grande} onCambio={recargar} />
        ))}
      </ul>
      {puedeEditar &&
        (agregando ? (
          <NuevaCuenta choferId={choferId} grande={grande} onListo={async () => { setAgregando(false); await recargar(); }} onCancelar={() => setAgregando(false)} />
        ) : (
          <button type="button" className={cn(BOTON_SECUNDARIO, grande && 'h-11')} onClick={() => setAgregando(true)}>
            <Plus className="size-4" /> Agregar cuenta
          </button>
        ))}
    </div>
  );
}

function FilaCuenta({
  c,
  choferId,
  puedeEditar,
  grande,
  onCambio,
}: {
  c: CuentaTransferencia;
  choferId: number | null;
  puedeEditar: boolean;
  grande: boolean;
  onCambio: () => Promise<unknown>;
}) {
  const [editando, setEditando] = useState(false);
  const [quitando, setQuitando] = useState(false);
  const [v, setV] = useState<CuentaTransferenciaTexto>(aTexto(c));
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const campo = grande ? 'h-11 w-full rounded-md border border-borde bg-panel px-3 text-base' : undefined;

  const correr = async (f: () => Promise<{ ok: boolean; error?: { mensaje: string } }>) => {
    setOcupado(true);
    setError(null);
    const r = await f();
    setOcupado(false);
    if (!r.ok) {
      setError(r.error?.mensaje ?? 'No se pudo guardar');
      return false;
    }
    await onCambio();
    return true;
  };

  if (editando)
    return (
      <li className="space-y-3 rounded-md border border-borde p-3">
        <p className="text-sm font-medium text-tinta">Cuenta en {c.moneda}</p>
        <CamposCuenta v={v} onCambiar={setV} moneda={c.moneda} clase={campo} />
        {error && <p className="text-sm text-error">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            className={BOTON_PRIMARIO}
            disabled={ocupado}
            onClick={async () => {
              if (await correr(() => guardar(choferId, { ...v, moneda: c.moneda, id: c.id }))) setEditando(false);
            }}
          >
            {ocupado ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} Guardar
          </button>
          <button type="button" className={BOTON_SECUNDARIO} disabled={ocupado} onClick={() => setEditando(false)}>
            Cancelar
          </button>
        </div>
      </li>
    );

  return (
    <li className="space-y-1 rounded-md border border-borde px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-tinta">
          <span className="font-medium">{c.moneda}</span> · {c.banco}
          {c.tipoCuenta && ` · ${c.tipoCuenta}`} · <span className="font-mono">{c.numero}</span>
          {c.principal && (
            <span className="ml-2 inline-flex items-center gap-1 rounded bg-marca/10 px-1.5 py-0.5 text-xs text-marca">
              <Star className="size-3" /> principal
            </span>
          )}
        </span>
        <span className="flex flex-wrap items-center gap-3 text-xs text-tinta-suave">
          <button
            type="button"
            className={cn('inline-flex items-center gap-1 underline', copiado && 'text-exito')}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(cuentaParaCopiar(c));
                setCopiado(true);
                setTimeout(() => setCopiado(false), 2000);
              } catch {
                setCopiado(false);
              }
            }}
          >
            {copiado ? <Check className="size-3" /> : <Copy className="size-3" />} {copiado ? 'Copiado' : 'Copiar'}
          </button>
          {puedeEditar && !c.principal && c.id && (
            <button type="button" className="inline-flex items-center gap-1 underline" disabled={ocupado} onClick={() => void correr(() => guardar(choferId, { ...aTexto(c), moneda: c.moneda, id: c.id, principal: true }))}>
              <Star className="size-3" /> Hacer principal
            </button>
          )}
          {puedeEditar && (
            <button
              type="button"
              className="inline-flex items-center gap-1 underline"
              onClick={() => {
                setV(aTexto(c));
                setEditando(true);
              }}
            >
              <Pencil className="size-3" /> Cambiar
            </button>
          )}
          {puedeEditar && c.id && !quitando && (
            <button type="button" className="inline-flex items-center gap-1 text-error underline" onClick={() => setQuitando(true)}>
              <Trash2 className="size-3" /> Quitar
            </button>
          )}
        </span>
      </div>
      <p className="text-tinta-suave">
        {c.titular}
        {c.titularDocumento && ` · ${c.titularDocumento}`}
      </p>
      {quitando && c.id && (
        <p className="flex flex-wrap items-center gap-2 text-tinta">
          ¿Quitar esta cuenta?
          <button type="button" className="text-error underline" disabled={ocupado} onClick={() => void correr(() => quitarCuentaTransferencia({ cuentaId: c.id! }))}>
            Sí, quitarla
          </button>
          <button type="button" className="underline" disabled={ocupado} onClick={() => setQuitando(false)}>
            No
          </button>
        </p>
      )}
      {error && <p className="text-error">{error}</p>}
    </li>
  );
}

/** Agregar otra cuenta. Si se pasa la moneda, no se elige. Devuelve el id de la cuenta nueva. */
export function NuevaCuenta({
  choferId,
  moneda: fija,
  grande = false,
  onListo,
  onCancelar,
}: {
  choferId: number | null;
  moneda?: string;
  grande?: boolean;
  onListo: (id: number | null) => Promise<unknown> | void;
  onCancelar?: () => void;
}) {
  const [moneda, setMoneda] = useState(fija ?? 'ARS');
  const [v, setV] = useState<CuentaTransferenciaTexto>(CUENTA_VACIA);
  const [principal, setPrincipal] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const campo = grande ? 'h-11 w-full rounded-md border border-borde bg-panel px-3 text-base' : undefined;
  const m = fija ?? moneda;
  return (
    <div className="space-y-3 rounded-md border border-borde bg-fondo p-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm font-medium text-tinta">Cuenta nueva</p>
        {!fija && (
          <select className="h-9 rounded-md border border-borde bg-panel px-2 text-sm" value={moneda} onChange={(e) => setMoneda(e.target.value)}>
            {MONEDAS_CUENTA.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        )}
      </div>
      <CamposCuenta v={v} onCambiar={setV} moneda={m} clase={campo} />
      <label className="flex items-center gap-2 text-sm text-tinta">
        <input type="checkbox" checked={principal} onChange={(e) => setPrincipal(e.target.checked)} /> Que sea la principal en {m} (la que se propone sola)
      </label>
      {error && <p className="text-sm text-error">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          className={BOTON_PRIMARIO}
          disabled={ocupado}
          onClick={async () => {
            if (!cuentaCompleta(v)) return setError('Escribí el banco o la billetera, el número y a nombre de quién está.');
            setOcupado(true);
            setError(null);
            const r = await guardar(choferId, { ...v, moneda: m, nueva: true, principal });
            setOcupado(false);
            if (!r.ok) return setError(r.error.mensaje);
            const id = (r.data as { id?: number } | null)?.id ?? null;
            await onListo(id);
          }}
        >
          {ocupado ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} Guardar la cuenta
        </button>
        {onCancelar && (
          <button type="button" className={BOTON_SECUNDARIO} disabled={ocupado} onClick={onCancelar}>
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Al pedir dinero: a cuál de sus cuentas de esa moneda va. valor null = la principal.
 * Si no tiene ninguna en esa moneda, se carga ahí mismo.
 */
export function ElegirCuenta({
  choferId,
  moneda,
  valor,
  onElegir,
  grande = false,
}: {
  choferId: number | null;
  moneda: string;
  valor: number | null;
  onElegir: (id: number | null) => void;
  grande?: boolean;
}) {
  const qc = useQueryClient();
  const q = useCuentasTransferencia(choferId);
  const [agregando, setAgregando] = useState(false);
  if (q.isPending) return <p className="text-sm text-tinta-suave">Buscando las cuentas…</p>;
  if (q.isError) return <p className="text-sm text-error">{q.error.message}</p>;
  const deLaMoneda = q.data.filter((c) => c.moneda === moneda && c.id !== null);
  const principal = deLaMoneda.find((c) => c.principal) ?? deLaMoneda[0] ?? null;
  const elegida = valor ?? principal?.id ?? null;
  const listo = async (id: number | null) => {
    setAgregando(false);
    await invalidar(qc, 'fondo');
    if (id) onElegir(id);
  };
  return (
    <div className="space-y-2">
      {deLaMoneda.length === 0 && !agregando && (
        <p className="flex items-center gap-2 text-sm text-alerta">
          <Landmark className="size-4" /> {choferId === null ? `No tenés cuenta en ${moneda}: cargala para que te transfieran.` : `El chofer no tiene cuenta en ${moneda}.`}
        </p>
      )}
      {deLaMoneda.length > 0 && (
        <ul className="space-y-1">
          {deLaMoneda.map((c) => (
            <li key={c.id}>
              <label className={cn('flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm', elegida === c.id ? 'border-marca bg-marca/5' : 'border-borde')}>
                <input type="radio" className="mt-1" name={`cuenta-${choferId ?? 'mia'}-${moneda}`} checked={elegida === c.id} onChange={() => onElegir(c.id)} />
                <span>
                  <span className="font-medium text-tinta">{c.banco}</span> · <span className="font-mono">{c.numero}</span>
                  {c.principal && <span className="ml-1 text-xs text-marca">(principal)</span>}
                  <span className="block text-tinta-suave">
                    {c.titular}
                    {c.titularDocumento && ` · ${c.titularDocumento}`}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {agregando || deLaMoneda.length === 0 ? (
        <NuevaCuenta choferId={choferId} moneda={moneda} grande={grande} onListo={listo} onCancelar={deLaMoneda.length > 0 ? () => setAgregando(false) : undefined} />
      ) : (
        <button type="button" className="inline-flex items-center gap-1 text-sm text-tinta-suave underline" onClick={() => setAgregando(true)}>
          <Plus className="size-3" /> Agregar otra cuenta
        </button>
      )}
    </div>
  );
}

/** En un pedido sin pagar: pasarlo a otra cuenta del chofer. */
export function CambiarCuentaPedido({ pedidoId, choferId, moneda, actual, onCambio }: { pedidoId: number; choferId: number; moneda: string; actual: number | null; onCambio: () => Promise<unknown> }) {
  const q = useCuentasTransferencia(choferId);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const otras = (q.data ?? []).filter((c) => c.moneda === moneda && c.id !== null && c.id !== actual);
  if (otras.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-tinta-suave">
      Pasar a otra cuenta del chofer:
      <select
        className="h-9 rounded-md border border-borde bg-panel px-2 text-sm text-tinta"
        value=""
        disabled={ocupado}
        onChange={async (e) => {
          const id = Number(e.target.value);
          if (!id) return;
          setOcupado(true);
          setError(null);
          const r = await elegirCuentaPedido({ pedidoId, cuentaId: id });
          setOcupado(false);
          if (!r.ok) return setError(r.error.mensaje);
          await onCambio();
        }}
      >
        <option value="">Elegí…</option>
        {otras.map((c) => (
          <option key={c.id} value={c.id!}>
            {c.banco} · {c.numero}
          </option>
        ))}
      </select>
      {ocupado && <LoaderCircle className="size-4 animate-spin" />}
      {error && <span className="text-error">{error}</span>}
    </div>
  );
}
