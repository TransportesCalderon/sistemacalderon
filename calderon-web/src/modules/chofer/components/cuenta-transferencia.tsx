'use client';

import { useState } from 'react';
import { Check, Copy, Landmark, LoaderCircle, Pencil } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { guardarCuentaTransferenciaChofer } from '../actions/cuenta-transferencia.actions';
import { aTexto, cuentaParaCopiar, type CuentaTransferencia, type CuentaTransferenciaTexto } from '../domain/cuenta-transferencia';

/** Migración 284 · Los datos de la cuenta a transferir: los campos (chofer y oficina) y cómo se ven en el pedido. */
export function CamposCuenta({
  v,
  onCambiar,
  moneda,
  clase,
}: {
  v: CuentaTransferenciaTexto;
  onCambiar: (v: CuentaTransferenciaTexto) => void;
  moneda: string;
  clase?: string;
}) {
  const set = (k: keyof CuentaTransferenciaTexto) => (e: { target: { value: string } }) => onCambiar({ ...v, [k]: e.target.value });
  const ar = moneda === 'ARS';
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Campo label="Banco o billetera">
        <input className={clase} maxLength={80} placeholder={ar ? 'Ej. Banco Nación, Mercado Pago' : 'Ej. Banco Estado'} value={v.banco} onChange={set('banco')} />
      </Campo>
      <Campo label={ar ? 'CBU, CVU o alias' : 'Número de cuenta'}>
        <input className={clase} maxLength={60} autoCapitalize="none" value={v.numero} onChange={set('numero')} />
      </Campo>
      <Campo label="A nombre de quién está">
        <input className={clase} maxLength={120} value={v.titular} onChange={set('titular')} />
      </Campo>
      <Campo label={ar ? 'CUIT o CUIL del titular' : 'RUT del titular'}>
        <input className={clase} maxLength={30} value={v.titularDocumento} onChange={set('titularDocumento')} />
      </Campo>
      <Campo label="Tipo de cuenta (si hace falta)">
        <input className={clase} maxLength={40} placeholder={ar ? 'Ej. caja de ahorro' : 'Ej. cuenta RUT, cuenta vista'} value={v.tipoCuenta} onChange={set('tipoCuenta')} />
      </Campo>
    </div>
  );
}

export const cuentaCompleta = (v: CuentaTransferenciaTexto) => v.banco.trim().length >= 2 && v.numero.trim().length >= 3 && v.titular.trim().length >= 3;

/** En el pedido: a qué cuenta hay que transferir, con «Copiar». Quien maneja los pedidos puede cargarla o corregirla. */
export function CuentaDestino({
  cuenta,
  choferId,
  moneda,
  puedeEditar,
  onCambio,
}: {
  cuenta: CuentaTransferencia | null;
  choferId: number;
  moneda: string;
  puedeEditar: boolean;
  onCambio: () => Promise<unknown>;
}) {
  const [editando, setEditando] = useState(false);
  const [v, setV] = useState<CuentaTransferenciaTexto>(aTexto(cuenta));
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  if (editando) {
    return (
      <div className="space-y-3 rounded-md border border-borde bg-fondo p-3">
        <p className="text-sm font-medium text-tinta">Cuenta del chofer para transferir ({moneda})</p>
        <CamposCuenta v={v} onCambiar={setV} moneda={moneda} />
        {error && <p className="text-sm text-error">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            className={BOTON_PRIMARIO}
            disabled={ocupado}
            onClick={async () => {
              setOcupado(true);
              setError(null);
              // Migración 303: se cambia esa cuenta (o se agrega, si no había)
              const r = await guardarCuentaTransferenciaChofer({ choferId, moneda, ...v, id: cuenta?.id ?? null, nueva: !cuenta });
              setOcupado(false);
              if (!r.ok) return setError(r.error.mensaje);
              setEditando(false);
              await onCambio();
            }}
          >
            {ocupado ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} Guardar la cuenta
          </button>
          <button type="button" className={BOTON_SECUNDARIO} disabled={ocupado} onClick={() => setEditando(false)}>
            Cancelar
          </button>
        </div>
      </div>
    );
  }
  const abrir = () => {
    setV(aTexto(cuenta));
    setEditando(true);
  };
  if (!cuenta) {
    return (
      <p className="flex flex-wrap items-center gap-2 rounded-md border border-alerta/40 bg-alerta/10 px-3 py-2 text-sm text-tinta">
        <Landmark className="size-4 text-alerta" /> Falta la cuenta para transferirle.
        {puedeEditar && (
          <button type="button" className="underline" onClick={abrir}>
            Cargarla
          </button>
        )}
      </p>
    );
  }
  return (
    <div className="rounded-md border border-borde bg-fondo px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-medium text-tinta">
          <Landmark className="size-4 text-marca" /> Transferir a
        </p>
        <span className="flex items-center gap-3">
          <button
            type="button"
            className={cn('inline-flex items-center gap-1 text-xs underline', copiado ? 'text-exito' : 'text-tinta-suave')}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(cuentaParaCopiar(cuenta));
                setCopiado(true);
                setTimeout(() => setCopiado(false), 2000);
              } catch {
                setCopiado(false);
              }
            }}
          >
            {copiado ? <Check className="size-3" /> : <Copy className="size-3" />} {copiado ? 'Copiado' : 'Copiar'}
          </button>
          {puedeEditar && (
            <button type="button" className="inline-flex items-center gap-1 text-xs text-tinta-suave underline" onClick={abrir}>
              <Pencil className="size-3" /> Cambiar
            </button>
          )}
        </span>
      </div>
      <p className="mt-1 text-tinta">
        {cuenta.banco}
        {cuenta.tipoCuenta && ` · ${cuenta.tipoCuenta}`} · <span className="font-mono">{cuenta.numero}</span>
      </p>
      <p className="text-tinta-suave">
        {cuenta.titular}
        {cuenta.titularDocumento && ` · ${cuenta.titularDocumento}`}
      </p>
    </div>
  );
}
