'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, LoaderCircle, Plus, Receipt, X } from 'lucide-react';
import { AccionConMotivo, Chip } from '@/modules/combustible/components/comun/ui';
import { useSesion } from '@/modules/core/session/session-provider';
import type { ErrorAccion } from '@/server/actions/result';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { formatearFechaDia, hoyEnZona } from '@/shared/lib/fechas';
import { invalidar } from '@/shared/query/invalidar';
import { browserDb } from '@/shared/supabase/browser';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { registrarCargoChofer, terminarCargoChofer } from '../actions/cargo-chofer.actions';
import { parsearCargos, type CargoChofer } from '../domain/cargo-chofer';
import { dinero } from '../domain/chofer.types';

const aNumero = (s: string) => {
  const t = s.trim().replace(/\./g, '').replace(',', '.');
  return t === '' ? NaN : Number(t);
};

/**
 * Migración 289 · Gastos que pagó la empresa y se le cobran al chofer en cuotas (por ejemplo, la visa de trabajo).
 * La liquidación de cada mes descuenta la cuota sola. Lo ven RRHH, Finanzas, Gerencia, TI y el auditor.
 */
export function CargosChofer({ choferId }: { choferId: number }) {
  const hay = useBaseTiene(289);
  const { rolesApp } = useSesion();
  const ve = rolesApp.some((r) => r === 'rrhh' || r === 'finanzas' || r === 'gerencia' || r === 'ti' || r === 'auditor');
  const edita = ve && !rolesApp.every((r) => r === 'auditor');
  const qc = useQueryClient();
  const [nuevo, setNuevo] = useState(false);
  const q = useQuery({
    queryKey: ['chofer', 'cargos', choferId] as const,
    enabled: hay && ve,
    queryFn: async () => {
      const { data, error } = await browserDb().schema('fin').rpc('fn_cargos_chofer', { p_chofer: choferId });
      if (error) throw error;
      return parsearCargos(data);
    },
  });
  if (!hay || !ve) return null;
  const recargar = () => invalidar(qc, 'fondo');
  const vigentes = (q.data ?? []).filter((c) => c.estado === 'vigente');
  const otros = (q.data ?? []).filter((c) => c.estado !== 'vigente');

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium text-tinta">
          <Receipt className="size-4" /> Gastos que se le cobran en cuotas
        </p>
        {edita && !nuevo && (
          <button type="button" className="inline-flex items-center gap-1 text-sm text-tinta-suave underline" onClick={() => setNuevo(true)}>
            <Plus className="size-3" /> Cargar uno (visa u otro)
          </button>
        )}
      </div>
      {nuevo && (
        <FormCargo
          choferId={choferId}
          onListo={async () => {
            setNuevo(false);
            await recargar();
          }}
          onCancelar={() => setNuevo(false)}
        />
      )}
      {q.isPending ? (
        <p className="text-sm text-tinta-suave">Buscando…</p>
      ) : q.isError ? (
        <p className="text-sm text-error">{q.error.message}</p>
      ) : vigentes.length === 0 && otros.length === 0 ? (
        <p className="text-sm text-tinta-suave">No tiene gastos para devolver.</p>
      ) : (
        <ul className="space-y-2">
          {[...vigentes, ...otros].map((c) => (
            <FilaCargo key={c.id} c={c} edita={edita} onCambio={recargar} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FilaCargo({ c, edita, onCambio }: { c: CargoChofer; edita: boolean; onCambio: () => Promise<unknown> }) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<ErrorAccion | null>(null);
  const vigente = c.estado === 'vigente';
  return (
    <li className="space-y-1 rounded-md border border-borde px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-tinta">
          {c.concepto} <span className="font-normal text-tinta-suave">· {c.numero}</span>
        </span>
        {vigente ? (
          <Chip tono="marca">
            {c.cuotasDescontadas} de {c.cuotas} cuotas
          </Chip>
        ) : (
          <Chip tono="neutro">{c.estado === 'anulado' ? 'Anulado' : 'Condonado'}</Chip>
        )}
      </div>
      <p className="tabular-nums text-tinta">
        Total {dinero(c.total, c.moneda)} en {c.cuotas} cuota{c.cuotas === 1 ? '' : 's'} desde {formatearFechaDia(c.desde).slice(3)}
        {vigente && (
          <>
            {' '}
            · le falta devolver <strong>{dinero(c.saldo, c.moneda)}</strong>
          </>
        )}
      </p>
      {vigente && c.cuotaDeEsteMes && (
        <p className="text-tinta-suave">
          Este mes: cuota {c.cuotaDeEsteMes.numero} de {c.cuotas}, {dinero(c.cuotaDeEsteMes.importe, c.moneda)} (sale sola en la liquidación)
        </p>
      )}
      <p className="text-xs text-tinta-suave">
        Pagado el {formatearFechaDia(c.fecha)}
        {c.gasto && ` · gasto ${c.gasto}`}
        {c.observacion && ` · ${c.observacion}`}
        {c.motivo && ` · ${c.motivo}`}
      </p>
      {vigente && edita && (
        <AccionConMotivo
          etiqueta={c.cuotasDescontadas === 0 ? 'Anular' : 'No cobrar lo que falta'}
          icono={<X className="size-4" />}
          titulo={c.cuotasDescontadas === 0 ? 'Anular el cargo' : 'Condonar lo que falta'}
          explicacion={
            c.cuotasDescontadas === 0
              ? 'Todavía no se descontó ninguna cuota: el cargo se anula y lo pagado vuelve a ser gasto de la empresa.'
              : 'Se dejan de descontar las cuotas que faltan y eso vuelve a ser gasto de la empresa.'
          }
          ocupado={ocupado}
          error={error}
          onConfirmar={async (motivo) => {
            setOcupado(true);
            setError(null);
            const r = await terminarCargoChofer({ id: c.id, motivo });
            setOcupado(false);
            if (!r.ok) {
              setError(r.error);
              return false;
            }
            await onCambio();
            return true;
          }}
        />
      )}
    </li>
  );
}

function FormCargo({ choferId, onListo, onCancelar }: { choferId: number; onListo: () => Promise<void>; onCancelar: () => void }) {
  const { zonaHoraria } = useSesion();
  const hoy = hoyEnZona(zonaHoraria) as string;
  const [v, setV] = useState({ concepto: 'Visa de trabajo', moneda: 'CLP', total: '', cuotas: '6', desde: hoy.slice(0, 7), fecha: hoy, gasto: '', observacion: '' });
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  const total = aNumero(v.total);
  const cuotas = Number(v.cuotas);
  return (
    <div className="grid gap-3 rounded-lg border border-borde bg-fondo/40 p-4 sm:grid-cols-4">
      <p className="text-sm text-tinta-suave sm:col-span-4">
        Un gasto que pagó la empresa y el chofer devuelve en cuotas. Cada mes la liquidación descuenta la cuota sola. En la contabilidad, lo pagado deja de ser gasto y
        queda como plata que el chofer le debe a la empresa.
      </p>
      <Campo label="Qué se le cobra">
        <input maxLength={120} value={v.concepto} onChange={set('concepto')} />
      </Campo>
      <Campo label="Moneda">
        <select value={v.moneda} onChange={set('moneda')}>
          <option value="CLP">CLP</option>
          <option value="ARS">ARS</option>
          <option value="USD">USD</option>
        </select>
      </Campo>
      <Campo label="Total">
        <input inputMode="decimal" value={v.total} onChange={set('total')} />
      </Campo>
      <Campo label="Cuotas">
        <input type="number" min={1} max={36} value={v.cuotas} onChange={set('cuotas')} />
      </Campo>
      <Campo label="Primera cuota (mes de liquidación)">
        <input type="month" value={v.desde} onChange={set('desde')} />
      </Campo>
      <Campo label="Fecha en que se pagó">
        <input type="date" value={v.fecha} onChange={set('fecha')} />
      </Campo>
      <Campo label="N° de gasto en Finanzas (si se cargó)" ayuda="Ej. GA-000123. Si no, se toma como «Permisos».">
        <input maxLength={30} value={v.gasto} onChange={set('gasto')} />
      </Campo>
      <Campo label="Observación (opcional)">
        <input maxLength={500} value={v.observacion} onChange={set('observacion')} />
      </Campo>
      {total > 0 && cuotas >= 1 && (
        <p className="text-sm text-tinta sm:col-span-4">
          Son {cuotas} cuota{cuotas === 1 ? '' : 's'} de {dinero(Math.round((total / cuotas) * 100) / 100, v.moneda)}.
        </p>
      )}
      {error && <p className="text-sm text-error sm:col-span-4">{error}</p>}
      <div className="flex gap-2 sm:col-span-4">
        <button
          type="button"
          className={BOTON_PRIMARIO}
          disabled={ocupado}
          onClick={async () => {
            setOcupado(true);
            setError(null);
            const r = await registrarCargoChofer({ choferId, ...v, moneda: v.moneda as 'ARS' | 'CLP' | 'USD', total, cuotas });
            setOcupado(false);
            if (!r.ok) return setError(r.error.mensaje);
            await onListo();
          }}
        >
          {ocupado ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} Guardar
        </button>
        <button type="button" className={BOTON_SECUNDARIO} disabled={ocupado} onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
