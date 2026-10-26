'use client';

import { useState } from 'react';
import { Pencil, Plus, RefreshCw } from 'lucide-react';
import { Panel, TD, TH, useEnvio } from '@/modules/catalogos/components/comun';
import { Cargando, Chip, Encabezado, ErrorBase, ErrorLectura, Seccion } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import { cn } from '@/shared/lib/cn';
import { BOTON_ICONO, BOTON_PRIMARIO, BOTON_SECUNDARIO } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { ETIQUETA_TIPO_CUENTA, type CuentaContable } from '../domain/finanzas.types';
import { useGuardarCuentaContable, usePlanCuentas, useRecontabilizar } from '../queries/hooks';

interface Form {
  id: number | null;
  codigo: string;
  nombre: string;
  activa: boolean;
}

/** Finanzas › Plan de cuentas: la base de la contabilidad. El contador puede agregar subcuentas o cambiar nombres. */
export function PlanCuentasPantalla() {
  const puede = useCan('finanzas.plan_cuentas:editar');
  const { data, isLoading, isError, error, refetch } = usePlanCuentas();
  const guardar = useGuardarCuentaContable();
  const rehacer = useRecontabilizar();
  const envio = useEnvio();
  const envioR = useEnvio();
  const [form, setForm] = useState<Form | null>(null);
  const [rehecho, setRehecho] = useState<string | null>(null);

  if (isLoading) return <Cargando texto="Cargando el plan de cuentas…" />;
  if (isError || !data) return <ErrorLectura texto="No se pudo leer el plan de cuentas." onReintentar={() => void refetch()} error={error} />;
  const nivel = (c: CuentaContable) => c.codigo.split('.').length - 1;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Encabezado titulo="Plan de cuentas" subtitulo="Finanzas" />
        {puede && !form && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={BOTON_SECUNDARIO}
              disabled={rehacer.isPending}
              onClick={() =>
                void envioR.enviar(
                  rehacer.mutateAsync({}).then((r) => {
                    if (r.ok) {
                      const j = r.data as { documentos?: number; errores?: { documento: string; motivo: string }[] };
                      setRehecho(
                        `Se rehicieron los asientos de ${j.documentos ?? 0} documentos.` +
                          (j.errores?.length ? ` No se pudieron ${j.errores.length}: ${j.errores.slice(0, 3).map((e) => e.motivo).join(' · ')}` : ''),
                      );
                    }
                    return r;
                  }),
                  () => undefined,
                )
              }
            >
              <RefreshCw className={cn('size-4', rehacer.isPending && 'animate-spin')} /> Rehacer asientos
            </button>
            <button type="button" className={BOTON_PRIMARIO} onClick={() => setForm({ id: null, codigo: '', nombre: '', activa: true })}>
              <Plus className="size-4" /> Nueva subcuenta
            </button>
          </div>
        )}
      </div>
      <p className="text-sm text-tinta-suave">
        Es el plan base para una empresa de transporte en Chile. Las cuentas marcadas «del sistema» las usa el programa solo (clientes, proveedores, IVA…).
        Las de bancos y cajas se crean solas en Bancos y cajas. Mostráselo a tu contador: puede agregar subcuentas o cambiar nombres.
      </p>
      {rehecho && <p className="text-sm text-exito">{rehecho}</p>}
      <ErrorBase error={envioR.error} />

      {form && (
        <Panel
          titulo={form.id ? 'Cambiar la cuenta' : 'Nueva subcuenta'}
          explicacion={form.id ? undefined : 'El código dice dónde va: por ejemplo 6.1.13 queda dentro de 6.1 (gastos de administración).'}
          error={envio.error}
          ocupado={guardar.isPending}
          textoBoton="Guardar"
          onCerrar={() => setForm(null)}
          onConfirmar={() => void envio.enviar(guardar.mutateAsync(form), () => setForm(null))}
        >
          {!form.id && (
            <Campo label="Código">
              <input value={form.codigo} maxLength={20} placeholder="6.1.13" onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
            </Campo>
          )}
          <Campo label="Nombre">
            <input value={form.nombre} maxLength={120} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          </Campo>
          {form.id && (
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" className="size-4 accent-marca" checked={form.activa} onChange={(e) => setForm({ ...form, activa: e.target.checked })} /> Activa
            </label>
          )}
        </Panel>
      )}

      <Seccion titulo={`${data.filter((c) => c.imputable).length} cuentas`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-y border-borde bg-fondo">
              <tr>
                <th className={TH}>Código y nombre</th>
                <th className={TH}>Tipo</th>
                <th className={TH} />
                <th className={TH} />
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {data.map((c) => (
                <tr key={c.id} className={cn(!c.imputable && 'bg-fondo/60 font-medium', !c.activa && 'text-tinta-suave line-through')}>
                  <td className={TD} style={{ paddingLeft: `${0.75 + nivel(c) * 1.25}rem` }}>
                    <span className="tabular-nums">{c.codigo}</span> · {c.nombre}
                  </td>
                  <td className={cn(TD, 'text-xs text-tinta-suave')}>{ETIQUETA_TIPO_CUENTA[c.tipo]}</td>
                  <td className={TD}>
                    {c.uso && <Chip tono="marca">Del sistema</Chip>}
                    {c.banco && <Chip tono="neutro">Banco o caja</Chip>}
                  </td>
                  <td className={cn(TD, 'text-right')}>
                    {puede && !c.banco && (
                      <button type="button" className={BOTON_ICONO} aria-label={`Cambiar ${c.codigo}`} onClick={() => setForm({ id: c.id, codigo: c.codigo, nombre: c.nombre, activa: c.activa })}>
                        <Pencil className="size-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Seccion>
    </div>
  );
}
