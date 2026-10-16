'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Fuel, Pencil, Plus, Trash2 } from 'lucide-react';
import { useCan } from '@/modules/core/permissions/can';
import { Cargando, Chip, Encabezado, ErrorLectura, Vacio } from '@/modules/combustible/components/comun/ui';
import { cn } from '@/shared/lib/cn';
import { BOTON_PRIMARIO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import type { Estacion } from '../domain/catalogos.types';
import { useEliminarEstacion, useEstaciones, useGuardarEstacion, usePaises, useProveedores } from '../queries/hooks';
import { Panel, TD, TH, useEnvio } from './comun';

type Abierto = { modo: 'nuevo' } | { modo: 'editar' | 'eliminar'; e: Estacion } | null;

/** Comercial > Estaciones de servicio: las que elige la carga de combustible. */
export function EstacionesPantalla() {
  const puede = useCan('comercial.proveedores:editar');
  const { data, isPending, isError, refetch } = useEstaciones();
  const { data: proveedores } = useProveedores();
  const { data: paises } = usePaises();
  const [abierto, setAbierto] = useState<Abierto>(null);
  const [texto, setTexto] = useState('');
  const pais = (c: string) => paises?.find((p) => p.codigo === c)?.nombre ?? c;
  const proveedor = (id: number | null) => (id === null ? null : (proveedores?.find((p) => p.id === id)?.razonSocial ?? `#${id}`));
  const t = texto.trim().toLowerCase();
  const filas = (data ?? []).filter((e) => !t || `${e.codigo} ${e.nombre} ${proveedor(e.proveedorId) ?? ''}`.toLowerCase().includes(t));

  return (
    <div className="space-y-5">
      <Encabezado titulo="Estaciones de servicio" subtitulo="Catálogos">
        {puede && (
          <button type="button" className={BOTON_PRIMARIO} onClick={() => setAbierto({ modo: 'nuevo' })}>
            <Plus className="size-4" /> Nueva estación
          </button>
        )}
      </Encabezado>

      {puede && proveedores && proveedores.length === 0 && (
        <p className="rounded-lg border border-alerta/30 bg-alerta-suave p-3 text-sm text-alerta">
          Una estación externa necesita su proveedor.{' '}
          <Link href="/comercial/proveedores" className="font-medium underline">
            Cargá primero los proveedores
          </Link>
          .
        </p>
      )}

      {abierto?.modo === 'nuevo' && <FormEstacion onCerrar={() => setAbierto(null)} />}

      <input
        type="search"
        placeholder="Buscar por código, nombre o proveedor"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        className="h-9 w-full max-w-sm rounded-md border border-borde bg-panel px-3 text-sm outline-none focus:border-marca"
      />

      <div className={cn(TARJETA, 'overflow-x-auto')}>
        {isPending ? (
          <Cargando texto="Cargando estaciones…" />
        ) : isError ? (
          <ErrorLectura texto="No se pudieron cargar las estaciones." onReintentar={() => refetch()} />
        ) : filas.length === 0 ? (
          <Vacio icono={<Fuel className="size-5" />} texto={data.length === 0 ? 'Todavía no hay estaciones: sin ellas no se puede registrar una carga.' : 'Ninguna estación coincide con la búsqueda.'} />
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-borde bg-fondo">
              <tr>
                <th className={TH}>Código</th>
                <th className={TH}>Nombre</th>
                <th className={TH}>Proveedor</th>
                <th className={TH}>País</th>
                {puede && <th className={TH} />}
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {filas.map((e) => {
                const modo = abierto && abierto.modo !== 'nuevo' && abierto.e.id === e.id ? abierto.modo : null;
                return (
                  <FilaEstacion key={e.id} e={e} proveedor={proveedor(e.proveedorId)} pais={pais(e.pais)} puede={puede} modo={modo} onAbrir={setAbierto} />
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function FilaEstacion({
  e,
  proveedor,
  pais,
  puede,
  modo,
  onAbrir,
}: {
  e: Estacion;
  proveedor: string | null;
  pais: string;
  puede: boolean;
  modo: 'editar' | 'eliminar' | null;
  onAbrir: (a: Abierto) => void;
}) {
  return (
    <>
      <tr>
        <td className={cn(TD, 'font-mono')}>{e.codigo}</td>
        <td className={cn(TD, 'font-medium text-tinta')}>
          {e.nombre} {e.esTanquePropio && <Chip tono="marca">Surtidor propio</Chip>}
        </td>
        <td className={TD}>{proveedor ?? '—'}</td>
        <td className={TD}>{pais}</td>
        {puede && (
          <td className={cn(TD, 'text-right whitespace-nowrap')}>
            <button type="button" className="mr-3 inline-flex items-center gap-1 text-xs text-marca hover:underline" onClick={() => onAbrir({ modo: 'editar', e })}>
              <Pencil className="size-3.5" /> Editar
            </button>
            <button type="button" className="inline-flex items-center gap-1 text-xs text-marca hover:underline" onClick={() => onAbrir({ modo: 'eliminar', e })}>
              <Trash2 className="size-3.5" /> Eliminar
            </button>
          </td>
        )}
      </tr>
      {modo && (
        <tr>
          <td colSpan={5} className="px-3 pb-3">
            {modo === 'editar' ? <FormEstacion e={e} onCerrar={() => onAbrir(null)} /> : <EliminarEstacion e={e} onCerrar={() => onAbrir(null)} />}
          </td>
        </tr>
      )}
    </>
  );
}

function FormEstacion({ e, onCerrar }: { e?: Estacion; onCerrar: () => void }) {
  const guardar = useGuardarEstacion();
  const { data: paises } = usePaises();
  const { data: proveedores } = useProveedores();
  const { error, enviar, campo } = useEnvio();
  const [v, setV] = useState({
    codigo: e?.codigo ?? '',
    nombre: e?.nombre ?? '',
    proveedorId: e?.proveedorId ? String(e.proveedorId) : '',
    pais: e?.pais ?? '',
    esTanquePropio: e?.esTanquePropio ?? false,
  });
  const set = (k: 'codigo' | 'nombre' | 'proveedorId' | 'pais') => (ev: { target: { value: string } }) => setV({ ...v, [k]: ev.target.value });

  return (
    <Panel
      titulo={e ? `Editar ${e.nombre}` : 'Nueva estación'}
      explicacion="El país define la zona horaria de la carga y, con ella, qué día de cotización se usa."
      error={error}
      ocupado={guardar.isPending}
      textoBoton={e ? 'Guardar cambios' : 'Dar de alta'}
      onCerrar={onCerrar}
      onConfirmar={() => enviar(guardar.mutateAsync({ ...v, id: e?.id ?? null, versionFila: e?.versionFila ?? null }), onCerrar)}
    >
      <Campo label="Código *" error={campo('codigo')} ayuda="Único, por ejemplo YPF-USPALLATA.">
        <input className="uppercase" maxLength={30} value={v.codigo} onChange={set('codigo')} />
      </Campo>
      <Campo label="Nombre *" error={campo('nombre')}>
        <input maxLength={200} value={v.nombre} onChange={set('nombre')} />
      </Campo>
      <Campo label="País *" error={campo('pais')}>
        <select value={v.pais} onChange={set('pais')}>
          <option value="">Elegí…</option>
          {paises?.map((x) => (
            <option key={x.codigo} value={x.codigo}>
              {x.nombre}
            </option>
          ))}
        </select>
      </Campo>
      <Campo label={v.esTanquePropio ? 'Proveedor' : 'Proveedor *'} error={campo('proveedorId')}>
        <select value={v.proveedorId} onChange={set('proveedorId')}>
          <option value="">{v.esTanquePropio ? 'Sin proveedor' : 'Elegí…'}</option>
          {proveedores?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.razonSocial}
            </option>
          ))}
        </select>
      </Campo>
      <label className="flex items-center gap-2 self-end pb-2 text-sm text-tinta">
        <input type="checkbox" className="size-4 accent-marca" checked={v.esTanquePropio} onChange={(ev) => setV({ ...v, esTanquePropio: ev.target.checked })} />
        Surtidor propio de la empresa (Base Mendoza)
      </label>
    </Panel>
  );
}

function EliminarEstacion({ e, onCerrar }: { e: Estacion; onCerrar: () => void }) {
  const eliminar = useEliminarEstacion();
  const { error, enviar } = useEnvio();
  return (
    <Panel
      titulo={`Eliminar ${e.nombre}`}
      explicacion="Deja de aparecer al registrar cargas. Las cargas anteriores en esta estación se conservan."
      error={error}
      ocupado={eliminar.isPending}
      textoBoton="Eliminar"
      onCerrar={onCerrar}
      onConfirmar={() => enviar(eliminar.mutateAsync({ id: e.id, versionFila: e.versionFila }), onCerrar)}
    />
  );
}
