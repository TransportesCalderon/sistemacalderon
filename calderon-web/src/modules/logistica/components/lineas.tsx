'use client';

import { useState } from 'react';
import { Pencil, Plus, Route, Trash2 } from 'lucide-react';
import { Panel, TD, TH, useEnvio } from '@/modules/catalogos/components/comun';
import { Cargando, Encabezado, ErrorLectura, Vacio } from '@/modules/combustible/components/comun/ui';
import { useMonedas } from '@/modules/combustible/queries/hooks';
import { useCan } from '@/modules/core/permissions/can';
import { normalizar } from '@/modules/pizarra/domain/pizarra.filtros';
import { cn } from '@/shared/lib/cn';
import { BOTON_PRIMARIO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import type { Linea } from '../domain/operacion.types';
import { useEliminarLinea, useGuardarLinea, useLineas, useOpcionesViaje } from '../queries/hooks';
import { Lista } from './viajes-pantalla';

type Abierto = { modo: 'nuevo' } | { modo: 'editar' | 'eliminar'; l: Linea } | null;

/** Operación > Líneas (migración 41): los recorridos de REDLINE (SAI-BSAS, MZA-VALP…). */
export function LineasPantalla() {
  const puede = useCan('operacion.servicios:editar');
  const { data, isPending, isError, refetch } = useLineas();
  const { data: op } = useOpcionesViaje();
  const [abierto, setAbierto] = useState<Abierto>(null);
  const [texto, setTexto] = useState('');
  const lugar = (id: number | null) => (id === null ? '—' : (op?.lugares.find((u) => u.id === id)?.nombre ?? '…'));
  const t = normalizar(texto);
  const filas = (data ?? []).filter((l) => !t || [l.codigo, lugar(l.lugarRetiroId), lugar(l.lugarEntregaId)].some((c) => normalizar(c).includes(t)));

  return (
    <div className="space-y-5">
      <Encabezado titulo="Líneas" subtitulo="Operación · Logística">
        {puede && (
          <button type="button" className={BOTON_PRIMARIO} onClick={() => setAbierto({ modo: 'nuevo' })}>
            <Plus className="size-4" /> Nueva línea
          </button>
        )}
      </Encabezado>
      <p className="max-w-3xl text-sm text-tinta-suave">
        Como en REDLINE: al elegir la línea en una operación se completan el lugar de retiro, la aduana y el de entrega. Los lugares se
        cargan en Comercial › Ubicaciones.
      </p>
      {abierto?.modo === 'nuevo' && <FormLinea onCerrar={() => setAbierto(null)} />}
      <input
        type="search"
        placeholder="Buscar por código o lugar"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        className="h-9 w-full max-w-sm rounded-md border border-borde bg-panel px-3 text-sm outline-none focus:border-marca"
      />
      <div className={cn(TARJETA, 'overflow-x-auto')}>
        {isPending ? (
          <Cargando texto="Cargando líneas…" />
        ) : isError ? (
          <ErrorLectura texto="No se pudieron cargar las líneas." onReintentar={() => refetch()} />
        ) : filas.length === 0 ? (
          <Vacio icono={<Route className="size-5" />} texto={data.length === 0 ? 'Todavía no hay líneas.' : 'Ninguna línea coincide con la búsqueda.'} />
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-borde bg-fondo">
              <tr>
                <th className={TH}>Nombre</th>
                <th className={TH}>Lugar retiro</th>
                <th className={TH}>Lugar entrega</th>
                <th className={TH}>Aduana</th>
                <th className={cn(TH, 'text-right')}>Distancia (km)</th>
                <th className={TH}>Activa</th>
                <th className={TH}>Frontera</th>
                <th className={cn(TH, 'text-right')}>Tr. tiempo (h)</th>
                <th className={cn(TH, 'text-right')}>Canon chofer</th>
                {puede && <th className={TH} />}
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {filas.map((l) => {
                const modo = abierto && abierto.modo !== 'nuevo' && abierto.l.id === l.id ? abierto.modo : null;
                return (
                  <FilaLinea key={l.id} l={l} lugar={lugar} puede={puede} modo={modo} onAbrir={setAbierto} />
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function FilaLinea({
  l,
  lugar,
  puede,
  modo,
  onAbrir,
}: {
  l: Linea;
  lugar: (id: number | null) => string;
  puede: boolean;
  modo: 'editar' | 'eliminar' | null;
  onAbrir: (a: Abierto) => void;
}) {
  return (
    <>
      <tr className={cn(!l.activa && 'text-tinta-suave')}>
        <td className={cn(TD, 'font-mono font-semibold')}>{l.codigo}</td>
        <td className={TD}>{lugar(l.lugarRetiroId)}</td>
        <td className={TD}>{lugar(l.lugarEntregaId)}</td>
        <td className={TD}>{lugar(l.lugarAduanaId)}</td>
        <td className={cn(TD, 'text-right tabular-nums')}>{l.distanciaKm === null ? '—' : l.distanciaKm.toLocaleString('es-AR')}</td>
        <td className={TD}>{l.activa ? 'Sí' : 'No'}</td>
        <td className={TD}>{l.cruzaFrontera ? 'Sí' : 'No'}</td>
        <td className={cn(TD, 'text-right tabular-nums')}>{l.transitHoras ?? '—'}</td>
        <td className={cn(TD, 'text-right whitespace-nowrap tabular-nums')}>
          {l.canonChofer === null ? '—' : `${l.canonMoneda} ${l.canonChofer.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`}
        </td>
        {puede && (
          <td className={cn(TD, 'text-right whitespace-nowrap')}>
            <button type="button" className="mr-3 inline-flex items-center gap-1 text-xs text-marca hover:underline" onClick={() => onAbrir({ modo: 'editar', l })}>
              <Pencil className="size-3.5" /> Editar
            </button>
            <button type="button" className="inline-flex items-center gap-1 text-xs text-marca hover:underline" onClick={() => onAbrir({ modo: 'eliminar', l })}>
              <Trash2 className="size-3.5" /> Eliminar
            </button>
          </td>
        )}
      </tr>
      {modo && (
        <tr>
          <td colSpan={10} className="px-3 pb-3">
            {modo === 'editar' ? <FormLinea l={l} onCerrar={() => onAbrir(null)} /> : <EliminarLinea l={l} onCerrar={() => onAbrir(null)} />}
          </td>
        </tr>
      )}
    </>
  );
}

function FormLinea({ l, onCerrar }: { l?: Linea; onCerrar: () => void }) {
  const guardar = useGuardarLinea();
  const { data: op } = useOpcionesViaje();
  const { data: monedas } = useMonedas();
  const { error, enviar, campo } = useEnvio();
  const s = (x: number | null | undefined) => (x === null || x === undefined ? '' : String(x));
  const [v, setV] = useState({
    codigo: l?.codigo ?? '',
    lugarRetiroId: s(l?.lugarRetiroId),
    lugarEntregaId: s(l?.lugarEntregaId),
    lugarAduanaId: s(l?.lugarAduanaId),
    distanciaKm: s(l?.distanciaKm),
    transitHoras: s(l?.transitHoras),
    cruzaFrontera: l?.cruzaFrontera ?? false,
    activa: l?.activa ?? true,
    canonChofer: s(l?.canonChofer),
    canonMoneda: l?.canonMoneda ?? 'ARS',
  });
  const set = (k: keyof typeof v) => (x: string) => setV((p) => ({ ...p, [k]: x }));
  return (
    <Panel
      titulo={l ? `Editar ${l.codigo}` : 'Nueva línea'}
      error={error}
      ocupado={guardar.isPending}
      textoBoton={l ? 'Guardar cambios' : 'Dar de alta'}
      onCerrar={onCerrar}
      onConfirmar={() => enviar(guardar.mutateAsync({ ...v, id: l?.id ?? null, versionFila: l?.versionFila ?? null }), onCerrar)}
    >
      <Campo label="Nombre *" error={campo('codigo')} ayuda="Como lo conoce Logística: SAI-BSAS, MZA-VALP…">
        <input className="uppercase" maxLength={30} value={v.codigo} onChange={(e) => set('codigo')(e.target.value)} />
      </Campo>
      <Campo label="Lugar retiro *" error={campo('lugarRetiroId')}>
        <Lista valor={v.lugarRetiroId} opciones={op?.lugares} onCambiar={set('lugarRetiroId')} />
      </Campo>
      <Campo label="Lugar entrega *" error={campo('lugarEntregaId')}>
        <Lista valor={v.lugarEntregaId} opciones={op?.lugares} onCambiar={set('lugarEntregaId')} />
      </Campo>
      <Campo label="Aduana habitual" error={campo('lugarAduanaId')}>
        <Lista valor={v.lugarAduanaId} opciones={op?.lugares} onCambiar={set('lugarAduanaId')} vacio="—" />
      </Campo>
      <Campo label="Distancia (km)" error={campo('distanciaKm')}>
        <input inputMode="decimal" value={v.distanciaKm} onChange={(e) => set('distanciaKm')(e.target.value)} />
      </Campo>
      <Campo label="Tiempo de tránsito (h)" error={campo('transitHoras')}>
        <input inputMode="numeric" value={v.transitHoras} onChange={(e) => set('transitHoras')(e.target.value)} />
      </Campo>
      <Campo label="Canon del chofer" error={campo('canonChofer') ?? campo('canonMoneda')} ayuda="Lo que cobra el chofer por hacer la línea. Se propone en el viaje de chofer.">
        <div className="flex gap-2">
          <select className="w-24" value={v.canonMoneda} onChange={(e) => set('canonMoneda')(e.target.value)} aria-label="Moneda del canon">
            {(monedas ?? [{ codigo: 'ARS', nombre: 'ARS' }]).map((m) => (
              <option key={m.codigo} value={m.codigo}>
                {m.codigo}
              </option>
            ))}
          </select>
          <input inputMode="decimal" placeholder="Sin canon" value={v.canonChofer} onChange={(e) => set('canonChofer')(e.target.value)} />
        </div>
      </Campo>
      <label className="flex items-center gap-2 text-sm text-tinta">
        <input type="checkbox" checked={v.cruzaFrontera} onChange={(e) => setV((p) => ({ ...p, cruzaFrontera: e.target.checked }))} />
        Cruza frontera
      </label>
      <label className="flex items-center gap-2 text-sm text-tinta">
        <input type="checkbox" checked={v.activa} onChange={(e) => setV((p) => ({ ...p, activa: e.target.checked }))} />
        Activa (se puede elegir en operaciones nuevas)
      </label>
    </Panel>
  );
}

function EliminarLinea({ l, onCerrar }: { l: Linea; onCerrar: () => void }) {
  const eliminar = useEliminarLinea();
  const { error, enviar } = useEnvio();
  return (
    <Panel
      titulo={`Eliminar ${l.codigo}`}
      explicacion="Deja de aparecer en las listas. Las operaciones que la usaron la conservan. Si se va a volver a usar, mejor desactivala."
      error={error}
      ocupado={eliminar.isPending}
      textoBoton="Eliminar"
      onCerrar={onCerrar}
      onConfirmar={() => enviar(eliminar.mutateAsync({ id: l.id, versionFila: l.versionFila }), onCerrar)}
    />
  );
}
