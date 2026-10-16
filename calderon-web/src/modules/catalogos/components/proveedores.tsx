'use client';

import { useState } from 'react';
import { Pencil, Plus, Trash2, Truck } from 'lucide-react';
import { useCan } from '@/modules/core/permissions/can';
import { Cargando, Encabezado, ErrorLectura, Vacio } from '@/modules/combustible/components/comun/ui';
import { cn } from '@/shared/lib/cn';
import { BOTON_PRIMARIO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { ETIQUETA_TIPO_PROVEEDOR, TIPOS_PROVEEDOR, type Proveedor } from '../domain/catalogos.types';
import { useEliminarProveedor, useGuardarProveedor, useMonedas, usePaises, useProveedores } from '../queries/hooks';
import { Panel, TD, TH, useEnvio } from './comun';

type Abierto = { modo: 'nuevo' } | { modo: 'editar' | 'eliminar'; p: Proveedor } | null;

/** Comercial > Proveedores. Los proveedores de combustible son los dueños de las estaciones. */
export function ProveedoresPantalla() {
  const puede = useCan('comercial.proveedores:editar');
  const { data, isPending, isError, refetch } = useProveedores();
  const { data: paises } = usePaises();
  const [abierto, setAbierto] = useState<Abierto>(null);
  const pais = (c: string) => paises?.find((p) => p.codigo === c)?.nombre ?? c;

  return (
    <div className="space-y-5">
      <Encabezado titulo="Proveedores" subtitulo="Catálogos">
        {puede && (
          <button type="button" className={BOTON_PRIMARIO} onClick={() => setAbierto({ modo: 'nuevo' })}>
            <Plus className="size-4" /> Nuevo proveedor
          </button>
        )}
      </Encabezado>

      {abierto?.modo === 'nuevo' && <FormProveedor onCerrar={() => setAbierto(null)} />}

      <div className={cn(TARJETA, 'overflow-x-auto')}>
        {isPending ? (
          <Cargando texto="Cargando proveedores…" />
        ) : isError ? (
          <ErrorLectura texto="No se pudieron cargar los proveedores." onReintentar={() => refetch()} />
        ) : data.length === 0 ? (
          <Vacio icono={<Truck className="size-5" />} texto="Todavía no hay proveedores. Cargá primero los de combustible: las estaciones necesitan uno." />
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-borde bg-fondo">
              <tr>
                <th className={TH}>Código</th>
                <th className={TH}>Razón social</th>
                <th className={TH}>Tipo</th>
                <th className={TH}>País</th>
                <th className={TH}>Identificador fiscal</th>
                <th className={TH}>Moneda</th>
                {puede && <th className={TH} />}
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {data.map((p) => (
                <FilaProveedor key={p.id} p={p} pais={pais(p.pais)} puede={puede} abierto={abierto} onAbrir={setAbierto} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function FilaProveedor({
  p,
  pais,
  puede,
  abierto,
  onAbrir,
}: {
  p: Proveedor;
  pais: string;
  puede: boolean;
  abierto: Abierto;
  onAbrir: (a: Abierto) => void;
}) {
  const modo = abierto && abierto.modo !== 'nuevo' && abierto.p.id === p.id ? abierto.modo : null;
  return (
    <>
      <tr>
        <td className={cn(TD, 'font-mono')}>{p.codigo}</td>
        <td className={cn(TD, 'font-medium text-tinta')}>{p.razonSocial}</td>
        <td className={TD}>{ETIQUETA_TIPO_PROVEEDOR[p.tipo]}</td>
        <td className={TD}>{pais}</td>
        <td className={cn(TD, 'font-mono')}>{p.identificadorFiscal ?? '—'}</td>
        <td className={TD}>{p.monedaDefecto ?? '—'}</td>
        {puede && (
          <td className={cn(TD, 'text-right whitespace-nowrap')}>
            <button type="button" className="mr-3 inline-flex items-center gap-1 text-xs text-marca hover:underline" onClick={() => onAbrir({ modo: 'editar', p })}>
              <Pencil className="size-3.5" /> Editar
            </button>
            <button type="button" className="inline-flex items-center gap-1 text-xs text-marca hover:underline" onClick={() => onAbrir({ modo: 'eliminar', p })}>
              <Trash2 className="size-3.5" /> Eliminar
            </button>
          </td>
        )}
      </tr>
      {modo && (
        <tr>
          <td colSpan={7} className="px-3 pb-3">
            {modo === 'editar' ? <FormProveedor p={p} onCerrar={() => onAbrir(null)} /> : <EliminarProveedor p={p} onCerrar={() => onAbrir(null)} />}
          </td>
        </tr>
      )}
    </>
  );
}

function FormProveedor({ p, onCerrar }: { p?: Proveedor; onCerrar: () => void }) {
  const guardar = useGuardarProveedor();
  const { data: paises } = usePaises();
  const { data: monedas } = useMonedas();
  const { error, enviar, campo } = useEnvio();
  const [v, setV] = useState({
    codigo: p?.codigo ?? '',
    razonSocial: p?.razonSocial ?? '',
    identificadorFiscal: p?.identificadorFiscal ?? '',
    pais: p?.pais ?? '',
    tipo: p?.tipo ?? 'combustible',
    monedaDefecto: p?.monedaDefecto ?? '',
  });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });

  return (
    <Panel
      titulo={p ? `Editar ${p.razonSocial}` : 'Nuevo proveedor'}
      error={error}
      ocupado={guardar.isPending}
      textoBoton={p ? 'Guardar cambios' : 'Dar de alta'}
      onCerrar={onCerrar}
      onConfirmar={() =>
        enviar(guardar.mutateAsync({ ...v, tipo: v.tipo as 'combustible', id: p?.id ?? null, versionFila: p?.versionFila ?? null }), onCerrar)
      }
    >
      <Campo label="Código *" error={campo('codigo')} ayuda="Corto y único, por ejemplo YPF o COPEC.">
        <input className="uppercase" maxLength={30} value={v.codigo} onChange={set('codigo')} />
      </Campo>
      <Campo label="Razón social *" error={campo('razonSocial')}>
        <input maxLength={200} value={v.razonSocial} onChange={set('razonSocial')} />
      </Campo>
      <Campo label="Tipo *" error={campo('tipo')}>
        <select value={v.tipo} onChange={set('tipo')}>
          {TIPOS_PROVEEDOR.map((t) => (
            <option key={t} value={t}>
              {ETIQUETA_TIPO_PROVEEDOR[t]}
            </option>
          ))}
        </select>
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
      <Campo label="Identificador fiscal" error={campo('identificadorFiscal')} ayuda="CUIT, RUT, CNPJ o RUC.">
        <input className="font-mono" maxLength={30} value={v.identificadorFiscal} onChange={set('identificadorFiscal')} />
      </Campo>
      <Campo label="Moneda habitual" error={campo('monedaDefecto')}>
        <select value={v.monedaDefecto} onChange={set('monedaDefecto')}>
          <option value="">Sin indicar</option>
          {monedas?.map((m) => (
            <option key={m.codigo} value={m.codigo}>
              {m.codigo} · {m.nombre}
            </option>
          ))}
        </select>
      </Campo>
    </Panel>
  );
}

function EliminarProveedor({ p, onCerrar }: { p: Proveedor; onCerrar: () => void }) {
  const eliminar = useEliminarProveedor();
  const { error, enviar } = useEnvio();
  return (
    <Panel
      titulo={`Eliminar ${p.razonSocial}`}
      explicacion="Para un proveedor cargado por error. Sus estaciones y documentos anteriores se conservan."
      error={error}
      ocupado={eliminar.isPending}
      textoBoton="Eliminar"
      onCerrar={onCerrar}
      onConfirmar={() => enviar(eliminar.mutateAsync({ id: p.id, versionFila: p.versionFila }), onCerrar)}
    />
  );
}
