'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Fuel, Pencil, Plus } from 'lucide-react';
import { Panel, TD, TH, useEnvio } from '@/modules/catalogos/components/comun';
import { useProveedores } from '@/modules/catalogos/queries/hooks';
import { Cargando, Chip, Encabezado, ErrorLectura, Seccion, Vacio } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import { cn } from '@/shared/lib/cn';
import { BOTON_ICONO, BOTON_PRIMARIO } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { Pestanas } from '@/shared/ui/pestanas';
import { PESTANAS_GASTOS } from '@/shared/ui/pestanas-secciones';
import { dinero, ETIQUETA_MEDIO_CARGA, ETIQUETA_TIPO_MEDIO, type MedioPago, type TipoMedioPago } from '../domain/finanzas.types';
import { useCombustibleFinanzas, useCuentasParaElegir, useGuardarMedioPago } from '../queries/hooks';
import { fecha } from './comun';

interface Form {
  id: number | null;
  nombre: string;
  medio: 'tarjeta' | 'cuenta_corriente' | 'efectivo' | 'surtidor_propio';
  tipo: TipoMedioPago;
  proveedorId: number | null;
  cuentaDineroId: number | null;
  activo: boolean;
}

/**
 * Finanzas › Combustible (migración 74): cómo se paga cada carga y cuánto falta que facture cada
 * estación. La regla de un proveedor (ej.: Shell cuenta corriente) gana sobre la regla general del medio.
 */
export function CombustiblePantalla() {
  const puede = useCan('finanzas.gastos:editar');
  const { data, isLoading, isError, error, refetch } = useCombustibleFinanzas();
  const { data: proveedores } = useProveedores();
  const { data: cuentas } = useCuentasParaElegir();
  const guardar = useGuardarMedioPago();
  const envio = useEnvio();
  const [form, setForm] = useState<Form | null>(null);

  const nuevo = (): Form => ({ id: null, nombre: '', medio: 'cuenta_corriente', tipo: 'factura_posterior', proveedorId: null, cuentaDineroId: null, activo: true });
  const editar = (m: MedioPago): Form => ({
    id: m.id,
    nombre: m.nombre,
    medio: m.medio as Form['medio'],
    tipo: m.tipo,
    proveedorId: m.proveedorId,
    cuentaDineroId: m.cuentaDineroId,
    activo: m.activo,
  });

  if (isLoading) return <Cargando texto="Cargando el combustible…" />;
  if (isError || !data) return <ErrorLectura texto="No se pudo leer el combustible." onReintentar={() => void refetch()} error={error} />;
  const totalPorFacturar = data.porFacturar.reduce((s, p) => s + p.saldo, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Encabezado titulo="Combustible" subtitulo="Finanzas" />
        {puede && !form && (
          <button type="button" className={BOTON_PRIMARIO} onClick={() => setForm(nuevo())}>
            <Plus className="size-4" /> Nueva regla
          </button>
        )}
      </div>
      <Pestanas items={PESTANAS_GASTOS} />
      <p className="text-sm text-tinta-suave">
        Cada carga que se registra en Combustible entra sola a la contabilidad según estas reglas. Una carga en cuenta corriente queda «por facturar» al
        proveedor; cuando llega su factura, cargala en Gastos y marcá qué cargas incluye.
      </p>

      {data.pendientes > 0 && (
        <p className="rounded-md bg-alerta-suave p-3 text-sm text-alerta">
          Hay {data.pendientes} documento(s) que no se pudieron contabilizar.{' '}
          <Link href="/finanzas/plan-cuentas" className="underline">
            Ver cuáles
          </Link>
        </p>
      )}

      {form && (
        <Panel
          titulo={form.id ? 'Cambiar la regla' : 'Nueva regla de pago'}
          explicacion="Si elegís un proveedor, la regla vale solo para las cargas de ese proveedor."
          error={envio.error}
          ocupado={guardar.isPending}
          textoBoton="Guardar"
          onCerrar={() => setForm(null)}
          onConfirmar={() => void envio.enviar(guardar.mutateAsync(form), () => setForm(null))}
        >
          <Campo label="Nombre">
            <input value={form.nombre} maxLength={80} placeholder="Ej.: Shell Chile cuenta corriente" onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          </Campo>
          <Campo label="Medio de la carga">
            <select value={form.medio} onChange={(e) => setForm({ ...form, medio: e.target.value as Form['medio'] })}>
              {Object.entries(ETIQUETA_MEDIO_CARGA).map(([v, e]) => (
                <option key={v} value={v}>
                  {e}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Proveedor (estación)">
            <select value={form.proveedorId ?? ''} onChange={(e) => setForm({ ...form, proveedorId: e.target.value ? Number(e.target.value) : null })}>
              <option value="">— Todos —</option>
              {(proveedores ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.razonSocial}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Cómo se paga">
            <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoMedioPago })}>
              {Object.entries(ETIQUETA_TIPO_MEDIO).map(([v, e]) => (
                <option key={v} value={v}>
                  {e}
                </option>
              ))}
            </select>
          </Campo>
          {form.tipo === 'caja' && (
            <Campo label="Sale de">
              <select value={form.cuentaDineroId ?? ''} onChange={(e) => setForm({ ...form, cuentaDineroId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Elegí…</option>
                {(cuentas ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} ({c.moneda})
                  </option>
                ))}
              </select>
            </Campo>
          )}
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" className="size-4 accent-marca" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} /> Activa
          </label>
        </Panel>
      )}

      <Seccion titulo="Cómo se paga cada carga">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-y border-borde bg-fondo">
              <tr>
                <th className={TH}>Regla</th>
                <th className={TH}>Medio</th>
                <th className={TH}>Proveedor</th>
                <th className={TH}>Cómo se paga</th>
                <th className={cn(TH, 'text-right')}>Saldo prepago</th>
                <th className={TH} />
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {data.medios.map((m) => (
                <tr key={m.id} className={cn(!m.activo && 'text-tinta-suave')}>
                  <td className={TD}>
                    <span className="font-medium">{m.nombre}</span>
                    {!m.activo && <Chip tono="neutro">Inactiva</Chip>}
                  </td>
                  <td className={TD}>{ETIQUETA_MEDIO_CARGA[m.medio] ?? m.medio}</td>
                  <td className={TD}>{m.proveedor ?? <span className="text-tinta-suave">Todos</span>}</td>
                  <td className={cn(TD, 'text-xs')}>
                    {ETIQUETA_TIPO_MEDIO[m.tipo]}
                    {m.cuentaDinero && <span className="block text-tinta-suave">Sale de {m.cuentaDinero}</span>}
                  </td>
                  <td className={cn(TD, 'text-right tabular-nums')}>{m.saldoPrepago !== null ? dinero(m.saldoPrepago) : ''}</td>
                  <td className={cn(TD, 'text-right')}>
                    {puede && (
                      <button type="button" className={BOTON_ICONO} aria-label={`Cambiar ${m.nombre}`} onClick={() => setForm(editar(m))}>
                        <Pencil className="size-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-tinta-suave">
          Para cargar saldo a una tarjeta prepaga: Cobros y pagos › Egreso, y como categoría elegí la tarjeta.
        </p>
      </Seccion>

      <Seccion titulo={`Cargas sin factura del proveedor · ${dinero(totalPorFacturar)}`}>
        {data.porFacturar.length === 0 ? (
          <Vacio icono={<Fuel className="size-6" />} texto="No hay cargas esperando factura." />
        ) : (
          <table className="w-full text-sm">
            <thead className="border-y border-borde bg-fondo">
              <tr>
                <th className={TH}>Proveedor</th>
                <th className={cn(TH, 'text-right')}>Cargas</th>
                <th className={TH}>Desde</th>
                <th className={cn(TH, 'text-right')}>Falta facturar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {data.porFacturar.map((p) => (
                <tr key={p.proveedorId ?? 0}>
                  <td className={TD}>{p.proveedor ?? 'Sin proveedor'}</td>
                  <td className={cn(TD, 'text-right tabular-nums')}>{p.cargas}</td>
                  <td className={cn(TD, 'tabular-nums')}>{fecha(p.desde)}</td>
                  <td className={cn(TD, 'text-right font-medium tabular-nums')}>{dinero(p.saldo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Seccion>
    </div>
  );
}
