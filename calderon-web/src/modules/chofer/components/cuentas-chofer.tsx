'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Landmark, LoaderCircle, Pencil, Plus } from 'lucide-react';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { invalidar } from '@/shared/query/invalidar';
import { cn } from '@/shared/lib/cn';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import { guardarMiCuentaTransferencia } from '../actions/cuenta-transferencia.actions';
import { aTexto, MONEDAS_CUENTA, type CuentaTransferencia, type CuentaTransferenciaTexto } from '../domain/cuenta-transferencia';
import { CamposCuenta, CuentaDestino } from './cuenta-transferencia';
import { ListaCuentas } from './cuentas-varias';
import { useCuentasTransferencia } from './use-cuentas';

/**
 * Migración 288 · La cuenta a la que se le transfiere el fondo fijo al chofer (una por moneda).
 * La carga el chofer en Mi perfil, o la oficina en Fondos; al entregar dinero, Fondos la muestra sola.
 */
export { useCuentasTransferencia } from './use-cuentas';

/** Mi perfil (chofer): sus cuentas, para que le transfieran el dinero del viaje. */
export function MisCuentasTransferencia() {
  const hay = useBaseTiene(288);
  const varias = useBaseTiene(303);
  const q = useCuentasTransferencia(null, !varias);
  if (!hay) return null;
  // Migración 303: varias cuentas (Global66, Mercado Pago, un banco…), una principal por moneda
  if (varias)
    return (
      <section className={cn(TARJETA, 'space-y-3 p-6')}>
        <h2 className="flex items-center gap-2 font-medium text-tinta">
          <Landmark className="size-4 text-marca" /> Mis cuentas para recibir el fondo fijo
        </h2>
        <p className="text-sm text-tinta-suave">
          Cargá todas las que uses. Cuando pidas dinero elegís a cuál te lo transfieren; la principal es la que aparece marcada.
        </p>
        <ListaCuentas choferId={null} puedeEditar grande />
      </section>
    );
  const cuentas = q.data ?? [];
  return (
    <section className={cn(TARJETA, 'space-y-3 p-6')}>
      <h2 className="flex items-center gap-2 font-medium text-tinta">
        <Landmark className="size-4 text-marca" /> Mi cuenta para recibir el fondo fijo
      </h2>
      <p className="text-sm text-tinta-suave">A esta cuenta te transfieren el dinero del viaje. Cargá una por cada moneda en que te pagan.</p>
      {q.isPending ? (
        <p className="text-sm text-tinta-suave">Buscando tus cuentas…</p>
      ) : q.isError ? (
        <p className="text-sm text-error">{q.error.message}</p>
      ) : (
        <ul className="space-y-3">
          {MONEDAS_CUENTA.map((m) => (
            <MiCuenta key={m} moneda={m} cuenta={cuentas.find((c) => c.moneda === m) ?? null} />
          ))}
        </ul>
      )}
    </section>
  );
}

function MiCuenta({ moneda, cuenta }: { moneda: string; cuenta: CuentaTransferencia | null }) {
  const qc = useQueryClient();
  const [editando, setEditando] = useState(false);
  const [v, setV] = useState<CuentaTransferenciaTexto>(aTexto(cuenta));
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const campo = 'h-11 w-full rounded-md border border-borde bg-panel px-3 text-base';

  if (editando) {
    return (
      <li className="space-y-3 rounded-md border border-borde p-3">
        <p className="text-sm font-medium text-tinta">Cuenta en {moneda}</p>
        <CamposCuenta v={v} onCambiar={setV} moneda={moneda} clase={campo} />
        {error && <p className="text-sm text-error">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            className={BOTON_PRIMARIO}
            disabled={ocupado}
            onClick={async () => {
              setOcupado(true);
              setError(null);
              const r = await guardarMiCuentaTransferencia({ moneda, ...v });
              setOcupado(false);
              if (!r.ok) return setError(r.error.mensaje);
              setEditando(false);
              await invalidar(qc, 'fondo');
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
  }
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-borde px-3 py-2 text-sm">
      {cuenta ? (
        <span className="text-tinta">
          <span className="font-medium">{moneda}</span> · {cuenta.banco} · <span className="font-mono">{cuenta.numero}</span> · {cuenta.titular}
        </span>
      ) : (
        <span className="text-tinta-suave">{moneda} · sin cuenta cargada</span>
      )}
      <button
        type="button"
        className="inline-flex items-center gap-1 text-tinta-suave underline"
        onClick={() => {
          setV(aTexto(cuenta));
          setEditando(true);
        }}
      >
        {cuenta ? <Pencil className="size-3" /> : <Plus className="size-3" />} {cuenta ? 'Cambiar' : 'Cargar'}
      </button>
    </li>
  );
}

/** Fondos (oficina): las cuentas del chofer, con «Copiar» y «Cambiar». */
export function CuentasChoferOficina({ choferId, puedeEditar }: { choferId: number; puedeEditar: boolean }) {
  const hay = useBaseTiene(288);
  const varias = useBaseTiene(303);
  const qc = useQueryClient();
  const q = useCuentasTransferencia(choferId, !varias);
  const [otra, setOtra] = useState<string | null>(null);
  if (!hay) return null;
  if (varias)
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium text-tinta">Cuentas para transferirle</p>
        <ListaCuentas choferId={choferId} puedeEditar={puedeEditar} />
      </div>
    );
  if (q.isPending) return <p className="text-sm text-tinta-suave">Buscando las cuentas del chofer…</p>;
  if (q.isError) return <p className="text-sm text-error">{q.error.message}</p>;
  const cuentas = q.data;
  const faltan = MONEDAS_CUENTA.filter((m) => !cuentas.some((c) => c.moneda === m));
  const recargar = () => invalidar(qc, 'fondo');
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-tinta">Cuentas para transferirle</p>
      {cuentas.length === 0 && !otra && <p className="text-sm text-tinta-suave">El chofer todavía no cargó ninguna cuenta.</p>}
      {cuentas.map((c) => (
        <CuentaDestino key={c.moneda} cuenta={c} choferId={choferId} moneda={c.moneda} puedeEditar={puedeEditar} onCambio={recargar} />
      ))}
      {otra && <CuentaDestino key={`nueva-${otra}`} cuenta={null} choferId={choferId} moneda={otra} puedeEditar={puedeEditar} onCambio={async () => { setOtra(null); await recargar(); }} />}
      {puedeEditar && faltan.length > 0 && !otra && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-tinta-suave">
          Agregar cuenta en:
          {faltan.map((m) => (
            <button key={m} type="button" className="underline" onClick={() => setOtra(m)}>
              {m}
            </button>
          ))}
        </p>
      )}
    </div>
  );
}

/** Al entregar dinero: la cuenta de esa moneda, sola. */
export function CuentaParaEntrega({ choferId, moneda, puedeEditar }: { choferId: number; moneda: string; puedeEditar: boolean }) {
  const hay = useBaseTiene(288);
  const varias = useBaseTiene(303);
  const qc = useQueryClient();
  const q = useCuentasTransferencia(choferId);
  if (!hay || !moneda || q.isPending || q.isError) return null;
  // Migración 303: todas las cuentas de esa moneda (la principal primero), cada una con «Copiar»
  const deLaMoneda = q.data.filter((c) => c.moneda === moneda);
  if (varias && deLaMoneda.length > 1)
    return (
      <div className="space-y-2">
        {deLaMoneda.map((c) => (
          <CuentaDestino key={c.id ?? c.numero} cuenta={c} choferId={choferId} moneda={moneda} puedeEditar={puedeEditar} onCambio={() => invalidar(qc, 'fondo')} />
        ))}
      </div>
    );
  return (
    <CuentaDestino
      key={moneda}
      cuenta={q.data.find((c) => c.moneda === moneda) ?? null}
      choferId={choferId}
      moneda={moneda}
      puedeEditar={puedeEditar}
      onCambio={() => invalidar(qc, 'fondo')}
    />
  );
}
