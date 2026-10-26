'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Landmark, Pencil, Plus } from 'lucide-react';
import { Panel, useEnvio } from '@/modules/catalogos/components/comun';
import { Cargando, Chip, Encabezado, ErrorLectura, Vacio } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { hoyEnZona } from '@/shared/lib/fechas';
import { BOTON_ICONO, BOTON_PRIMARIO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { dinero, type CuentaDinero } from '../domain/finanzas.types';
import { useCuentasDinero, useGuardarCuentaDinero } from '../queries/hooks';
import { fecha, MONEDAS } from './comun';

interface Form {
  id: number | null;
  nombre: string;
  tipo: 'banco' | 'caja';
  banco: string;
  numero: string;
  moneda: string;
  saldoInicial: string;
  saldoInicialFecha: string;
  activa: boolean;
}

/** Finanzas › Bancos y cajas: cada cuenta con su saldo según el sistema y según la última cartola. */
export function BancosPantalla() {
  const { zonaHoraria } = useSesion();
  const puede = useCan('finanzas.bancos:editar');
  const { data, isLoading, isError, error, refetch } = useCuentasDinero();
  const guardar = useGuardarCuentaDinero();
  const envio = useEnvio();
  const [form, setForm] = useState<Form | null>(null);
  const hoy = hoyEnZona(zonaHoraria) as string;

  if (isLoading) return <Cargando texto="Cargando las cuentas…" />;
  if (isError || !data) return <ErrorLectura texto="No se pudieron leer las cuentas." onReintentar={() => void refetch()} error={error} />;

  const editar = (c: CuentaDinero): Form => ({
    id: c.id,
    nombre: c.nombre,
    tipo: c.tipo,
    banco: c.banco ?? '',
    numero: c.numero ?? '',
    moneda: c.moneda,
    saldoInicial: String(c.saldoInicial),
    saldoInicialFecha: c.saldoInicialFecha,
    activa: c.activa,
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Encabezado titulo="Bancos y cajas" subtitulo="Finanzas" />
        {puede && !form && (
          <button
            type="button"
            className={BOTON_PRIMARIO}
            onClick={() =>
              setForm({ id: null, nombre: '', tipo: 'banco', banco: '', numero: '', moneda: 'CLP', saldoInicial: '', saldoInicialFecha: hoy, activa: true })
            }
          >
            <Plus className="size-4" /> Nueva cuenta
          </button>
        )}
      </div>

      {form && (
        <Panel
          titulo={form.id ? 'Cambiar la cuenta' : 'Nueva cuenta'}
          explicacion="El saldo inicial es lo que había en la cuenta ese día (miralo en la cartola). Desde ahí el sistema suma y resta cada movimiento."
          error={envio.error}
          ocupado={guardar.isPending}
          textoBoton="Guardar"
          onCerrar={() => setForm(null)}
          onConfirmar={() => void envio.enviar(guardar.mutateAsync(form), () => setForm(null))}
        >
          <Campo label="Nombre">
            <input value={form.nombre} maxLength={80} placeholder="Ej.: Banco de Chile pesos" onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          </Campo>
          <Campo label="Tipo">
            <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as Form['tipo'] })}>
              <option value="banco">Cuenta bancaria</option>
              <option value="caja">Caja (efectivo)</option>
            </select>
          </Campo>
          <Campo label="Moneda">
            <select value={form.moneda} onChange={(e) => setForm({ ...form, moneda: e.target.value })}>
              {MONEDAS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </Campo>
          {form.tipo === 'banco' && (
            <>
              <Campo label="Banco">
                <input value={form.banco} maxLength={80} onChange={(e) => setForm({ ...form, banco: e.target.value })} />
              </Campo>
              <Campo label="N° de cuenta">
                <input value={form.numero} maxLength={40} onChange={(e) => setForm({ ...form, numero: e.target.value })} />
              </Campo>
            </>
          )}
          <Campo label="Saldo inicial">
            <input inputMode="decimal" value={form.saldoInicial} onChange={(e) => setForm({ ...form, saldoInicial: e.target.value })} />
          </Campo>
          <Campo label="Saldo al día">
            <input type="date" value={form.saldoInicialFecha} onChange={(e) => setForm({ ...form, saldoInicialFecha: e.target.value })} />
          </Campo>
          {form.id && (
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" className="size-4 accent-marca" checked={form.activa} onChange={(e) => setForm({ ...form, activa: e.target.checked })} /> Activa
            </label>
          )}
        </Panel>
      )}

      {data.length === 0 ? (
        <Vacio icono={<Landmark className="size-6" />} texto="Todavía no hay cuentas. Cargá cada cuenta bancaria y la caja, con el saldo de hoy." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.map((c) => {
            const dif = c.cartolaSaldo === null ? null : c.saldo - c.cartolaSaldo;
            return (
              <div key={c.id} className={cn(TARJETA, 'space-y-3 p-4', !c.activa && 'opacity-60')}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Link href={`/finanzas/bancos/${c.id}`} className="font-medium text-marca hover:underline">
                      {c.nombre}
                    </Link>
                    <p className="text-xs text-tinta-suave">
                      {c.tipo === 'caja' ? 'Caja' : [c.banco, c.numero].filter(Boolean).join(' · ') || 'Banco'} · {c.moneda}
                      {!c.activa && ' · inactiva'}
                    </p>
                  </div>
                  {puede && (
                    <button type="button" className={BOTON_ICONO} aria-label={`Cambiar ${c.nombre}`} onClick={() => setForm(editar(c))}>
                      <Pencil className="size-4" />
                    </button>
                  )}
                </div>
                <div>
                  <p className="text-xs text-tinta-suave">Saldo según el sistema</p>
                  <p className={cn('text-2xl font-semibold tabular-nums', c.saldo < 0 ? 'text-error' : 'text-tinta')}>{dinero(c.saldo, c.moneda)}</p>
                  {c.moneda !== 'CLP' && c.saldoClp !== null && <p className="text-xs text-tinta-suave">≈ {dinero(c.saldoClp)}</p>}
                </div>
                {c.tipo === 'banco' && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {c.cartolaSaldo === null ? (
                      <span className="text-tinta-suave">Sin cartola importada</span>
                    ) : (
                      <span className="text-tinta-suave">
                        Cartola al {fecha(c.cartolaFecha)}: <span className="font-medium text-tinta tabular-nums">{dinero(c.cartolaSaldo, c.moneda)}</span>
                      </span>
                    )}
                    {dif !== null && Math.abs(dif) >= 1 && <Chip tono="alerta">Diferencia {dinero(dif, c.moneda)}</Chip>}
                    {c.porConciliar > 0 && <Chip tono="marca">{c.porConciliar} por conciliar</Chip>}
                  </div>
                )}
                <Link href={`/finanzas/bancos/${c.id}`} className="inline-block text-sm font-medium text-marca hover:underline">
                  {c.tipo === 'banco' ? 'Importar cartola y conciliar →' : 'Ver movimientos →'}
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
