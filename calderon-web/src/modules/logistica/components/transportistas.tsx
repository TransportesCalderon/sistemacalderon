'use client';

import { useState } from 'react';
import { Pencil, Plus, Trash2, Truck } from 'lucide-react';
import { Panel, TD, TH, useEnvio } from '@/modules/catalogos/components/comun';
import { Cargando, Encabezado, ErrorLectura, Vacio } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import { cn } from '@/shared/lib/cn';
import { BOTON_PRIMARIO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import type { Transportista } from '../domain/operacion.types';
import { useEliminarTransportista, useGuardarTransportista, useTransportistas } from '../queries/hooks';
import { AgentesTransporte } from './agentes-transporte';

type Abierto = { modo: 'nuevo' } | { modo: 'editar' | 'eliminar'; t: Transportista } | null;

/** Operación > Transportistas (migración 41): fleteros externos, para la operación que no hace Calderón. */
export function TransportistasPantalla() {
  const puede = useCan('operacion.servicios:editar');
  const { data, isPending, isError, refetch } = useTransportistas();
  const [abierto, setAbierto] = useState<Abierto>(null);
  return (
    <div className="space-y-5">
      <Encabezado titulo="Transportistas externos" subtitulo="Operación · Logística">
        {puede && (
          <button type="button" className={BOTON_PRIMARIO} onClick={() => setAbierto({ modo: 'nuevo' })}>
            <Plus className="size-4" /> Nuevo transportista
          </button>
        )}
      </Encabezado>
      <p className="max-w-3xl text-sm text-tinta-suave">
        Solo para cuando una operación la hace un fletero. Las operaciones con equipo propio no llevan transportista.
      </p>
      {abierto?.modo === 'nuevo' && <FormTransportista onCerrar={() => setAbierto(null)} />}
      <div className={cn(TARJETA, 'overflow-x-auto')}>
        {isPending ? (
          <Cargando texto="Cargando transportistas…" />
        ) : isError ? (
          <ErrorLectura texto="No se pudieron cargar los transportistas." onReintentar={() => refetch()} />
        ) : data.length === 0 ? (
          <Vacio icono={<Truck className="size-5" />} texto="Todavía no hay transportistas externos." />
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-borde bg-fondo">
              <tr>
                <th className={TH}>Razón social</th>
                <th className={TH}>CUIT</th>
                <th className={TH}>Teléfono</th>
                <th className={TH}>Activo</th>
                <th className={TH}>Observaciones</th>
                {puede && <th className={TH} />}
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {data.map((t) => {
                const modo = abierto && abierto.modo !== 'nuevo' && abierto.t.id === t.id ? abierto.modo : null;
                return (
                  <FilaTransportista key={t.id} t={t} puede={puede} modo={modo} onAbrir={setAbierto} />
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {/* Migración 137 */}
      <AgentesTransporte />
    </div>
  );
}

function FilaTransportista({
  t,
  puede,
  modo,
  onAbrir,
}: {
  t: Transportista;
  puede: boolean;
  modo: 'editar' | 'eliminar' | null;
  onAbrir: (a: Abierto) => void;
}) {
  return (
    <>
      <tr className={cn(!t.activo && 'text-tinta-suave')}>
        <td className={cn(TD, 'font-medium')}>{t.razonSocial}</td>
        <td className={cn(TD, 'font-mono')}>{t.cuit ?? '—'}</td>
        <td className={TD}>{t.telefono ?? '—'}</td>
        <td className={TD}>{t.activo ? 'Sí' : 'No'}</td>
        <td className={cn(TD, 'text-xs')}>{t.observaciones ?? '—'}</td>
        {puede && (
          <td className={cn(TD, 'text-right whitespace-nowrap')}>
            <button type="button" className="mr-3 inline-flex items-center gap-1 text-xs text-marca hover:underline" onClick={() => onAbrir({ modo: 'editar', t })}>
              <Pencil className="size-3.5" /> Editar
            </button>
            <button type="button" className="inline-flex items-center gap-1 text-xs text-marca hover:underline" onClick={() => onAbrir({ modo: 'eliminar', t })}>
              <Trash2 className="size-3.5" /> Eliminar
            </button>
          </td>
        )}
      </tr>
      {modo && (
        <tr>
          <td colSpan={6} className="px-3 pb-3">
            {modo === 'editar' ? (
              <FormTransportista t={t} onCerrar={() => onAbrir(null)} />
            ) : (
              <EliminarTransportista t={t} onCerrar={() => onAbrir(null)} />
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function FormTransportista({ t, onCerrar }: { t?: Transportista; onCerrar: () => void }) {
  const guardar = useGuardarTransportista();
  const { error, enviar, campo } = useEnvio();
  const [v, setV] = useState({
    razonSocial: t?.razonSocial ?? '',
    cuit: t?.cuit ?? '',
    telefono: t?.telefono ?? '',
    observaciones: t?.observaciones ?? '',
    activo: t?.activo ?? true,
  });
  const set = (k: 'razonSocial' | 'cuit' | 'telefono' | 'observaciones') => (e: { target: { value: string } }) =>
    setV((p) => ({ ...p, [k]: e.target.value }));
  return (
    <Panel
      titulo={t ? `Editar ${t.razonSocial}` : 'Nuevo transportista'}
      error={error}
      ocupado={guardar.isPending}
      textoBoton={t ? 'Guardar cambios' : 'Dar de alta'}
      onCerrar={onCerrar}
      onConfirmar={() => enviar(guardar.mutateAsync({ ...v, id: t?.id ?? null, versionFila: t?.versionFila ?? null }), onCerrar)}
    >
      <Campo label="Razón social *" error={campo('razonSocial')}>
        <input className="uppercase" maxLength={200} value={v.razonSocial} onChange={set('razonSocial')} />
      </Campo>
      <Campo label="CUIT" error={campo('cuit')} ayuda="11 números; los guiones se quitan solos.">
        <input inputMode="numeric" maxLength={13} value={v.cuit} onChange={set('cuit')} />
      </Campo>
      <Campo label="Teléfono" error={campo('telefono')}>
        <input maxLength={40} value={v.telefono} onChange={set('telefono')} />
      </Campo>
      <Campo label="Observaciones" error={campo('observaciones')}>
        <input maxLength={1000} value={v.observaciones} onChange={set('observaciones')} />
      </Campo>
      <label className="flex items-center gap-2 text-sm text-tinta">
        <input type="checkbox" checked={v.activo} onChange={(e) => setV((p) => ({ ...p, activo: e.target.checked }))} />
        Activo
      </label>
    </Panel>
  );
}

function EliminarTransportista({ t, onCerrar }: { t: Transportista; onCerrar: () => void }) {
  const eliminar = useEliminarTransportista();
  const { error, enviar } = useEnvio();
  return (
    <Panel
      titulo={`Eliminar ${t.razonSocial}`}
      explicacion="Deja de aparecer en las listas. No se puede si tiene operaciones abiertas."
      error={error}
      ocupado={eliminar.isPending}
      textoBoton="Eliminar"
      onCerrar={onCerrar}
      onConfirmar={() => enviar(eliminar.mutateAsync({ id: t.id, versionFila: t.versionFila }), onCerrar)}
    />
  );
}
