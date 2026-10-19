'use client';

import { useState } from 'react';
import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { useCan } from '@/modules/core/permissions/can';
import { Cargando, Encabezado, ErrorLectura, Vacio } from '@/modules/combustible/components/comun/ui';
import { cn } from '@/shared/lib/cn';
import { BOTON_PRIMARIO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { TIPO_UBICACION_ETIQUETA, TIPOS_UBICACION, type Ubicacion } from '../domain/catalogos.types';
import { useEliminarUbicacion, useGuardarUbicacion, usePaises, useUbicaciones } from '../queries/hooks';
import { Panel, TD, TH, useEnvio } from './comun';

type Abierto = { modo: 'nuevo' } | { modo: 'editar' | 'eliminar'; u: Ubicacion } | null;

/** Comercial > Ubicaciones: puertos, base y clientes (PTM, Enchufe, San Antonio…). */
export function UbicacionesPantalla() {
  const puede = useCan('comercial.ubicaciones:editar');
  const { data, isPending, isError, refetch } = useUbicaciones();
  const { data: paises } = usePaises();
  const [abierto, setAbierto] = useState<Abierto>(null);
  const [texto, setTexto] = useState('');
  const t = texto.trim().toLowerCase();
  const filas = (data ?? []).filter((u) => !t || `${u.codigo} ${u.nombre}`.toLowerCase().includes(t));
  const pais = (c: string) => paises?.find((p) => p.codigo === c)?.nombre ?? c;

  return (
    <div className="space-y-5">
      <Encabezado titulo="Ubicaciones" subtitulo="Comercial">
        {puede && (
          <button type="button" className={BOTON_PRIMARIO} onClick={() => setAbierto({ modo: 'nuevo' })}>
            <Plus className="size-4" /> Nueva ubicación
          </button>
        )}
      </Encabezado>
      <p className="max-w-3xl text-sm text-tinta-suave">
        Puertos, base y clientes. Con latitud, longitud y radio, la Pizarra Azul muestra el nombre del lugar cuando el GPS del tractor está
        adentro (por defecto, 2 km).
      </p>
      {abierto?.modo === 'nuevo' && <FormUbicacion onCerrar={() => setAbierto(null)} />}
      <input
        type="search"
        placeholder="Buscar por código o nombre"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        className="h-9 w-full max-w-sm rounded-md border border-borde bg-panel px-3 text-sm outline-none focus:border-marca"
      />
      <div className={cn(TARJETA, 'overflow-x-auto')}>
        {isPending ? (
          <Cargando texto="Cargando ubicaciones…" />
        ) : isError ? (
          <ErrorLectura texto="No se pudieron cargar las ubicaciones." onReintentar={() => refetch()} />
        ) : filas.length === 0 ? (
          <Vacio
            icono={<MapPin className="size-5" />}
            texto={data.length === 0 ? 'Todavía no hay ubicaciones.' : 'Ninguna ubicación coincide con la búsqueda.'}
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-borde bg-fondo">
              <tr>
                <th className={TH}>Código</th>
                <th className={TH}>Nombre</th>
                <th className={TH}>Tipo</th>
                <th className={TH}>País</th>
                <th className={TH}>Geocerca</th>
                {puede && <th className={TH} />}
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {filas.map((u) => {
                const modo = abierto && abierto.modo !== 'nuevo' && abierto.u.id === u.id ? abierto.modo : null;
                return <FilaUbicacion key={u.id} u={u} pais={pais(u.pais)} puede={puede} modo={modo} onAbrir={setAbierto} />;
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function FilaUbicacion({
  u,
  pais,
  puede,
  modo,
  onAbrir,
}: {
  u: Ubicacion;
  pais: string;
  puede: boolean;
  modo: 'editar' | 'eliminar' | null;
  onAbrir: (a: Abierto) => void;
}) {
  return (
    <>
      <tr>
        <td className={cn(TD, 'font-mono')}>{u.codigo}</td>
        <td className={cn(TD, 'font-medium text-tinta')}>{u.nombre}</td>
        <td className={TD}>{TIPO_UBICACION_ETIQUETA[u.tipo] ?? u.tipo}</td>
        <td className={TD}>{pais}</td>
        <td className={cn(TD, 'text-xs')}>
          {u.latitud === null ? (
            <span className="text-tinta-suave">Sin coordenadas</span>
          ) : (
            `${u.latitud}, ${u.longitud} · ${u.radioM ?? 2000} m`
          )}
        </td>
        {puede && (
          <td className={cn(TD, 'text-right whitespace-nowrap')}>
            <button
              type="button"
              className="mr-3 inline-flex items-center gap-1 text-xs text-marca hover:underline"
              onClick={() => onAbrir({ modo: 'editar', u })}
            >
              <Pencil className="size-3.5" /> Editar
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs text-marca hover:underline"
              onClick={() => onAbrir({ modo: 'eliminar', u })}
            >
              <Trash2 className="size-3.5" /> Eliminar
            </button>
          </td>
        )}
      </tr>
      {modo && (
        <tr>
          <td colSpan={6} className="px-3 pb-3">
            {modo === 'editar' ? (
              <FormUbicacion u={u} onCerrar={() => onAbrir(null)} />
            ) : (
              <EliminarUbicacion u={u} onCerrar={() => onAbrir(null)} />
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function FormUbicacion({ u, onCerrar }: { u?: Ubicacion; onCerrar: () => void }) {
  const guardar = useGuardarUbicacion();
  const { data: paises } = usePaises();
  const { error, enviar, campo } = useEnvio();
  const [v, setV] = useState({
    codigo: u?.codigo ?? '',
    nombre: u?.nombre ?? '',
    tipo: u?.tipo ?? 'puerto',
    pais: u?.pais ?? 'AR',
    latitud: u?.latitud === null || u?.latitud === undefined ? '' : String(u.latitud),
    longitud: u?.longitud === null || u?.longitud === undefined ? '' : String(u.longitud),
    radioM: u?.radioM ? String(u.radioM) : '',
  });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  return (
    <Panel
      titulo={u ? `Editar ${u.nombre}` : 'Nueva ubicación'}
      explicacion="Las coordenadas son opcionales: sin ellas, el lugar igual se puede elegir como «lugar en playa» en la Pizarra."
      error={error}
      ocupado={guardar.isPending}
      textoBoton={u ? 'Guardar cambios' : 'Dar de alta'}
      onCerrar={onCerrar}
      onConfirmar={() =>
        enviar(
          guardar.mutateAsync({ ...v, tipo: v.tipo as Ubicacion['tipo'], id: u?.id ?? null, versionFila: u?.versionFila ?? null }),
          onCerrar,
        )
      }
    >
      <Campo label="Código *" error={campo('codigo')} ayuda="Único, por ejemplo PTM o ENCHUFE.">
        <input className="uppercase" maxLength={30} value={v.codigo} onChange={set('codigo')} />
      </Campo>
      <Campo label="Nombre *" error={campo('nombre')} ayuda="Como se ve en la Pizarra.">
        <input maxLength={200} value={v.nombre} onChange={set('nombre')} />
      </Campo>
      <Campo label="Tipo *" error={campo('tipo')}>
        <select value={v.tipo} onChange={set('tipo')}>
          {TIPOS_UBICACION.map((x) => (
            <option key={x} value={x}>
              {TIPO_UBICACION_ETIQUETA[x]}
            </option>
          ))}
        </select>
      </Campo>
      <Campo label="País *" error={campo('pais')}>
        <select value={v.pais} onChange={set('pais')}>
          {paises?.map((p) => (
            <option key={p.codigo} value={p.codigo}>
              {p.nombre}
            </option>
          ))}
        </select>
      </Campo>
      <Campo label="Latitud" error={campo('latitud')} ayuda="Por ejemplo -32.8895">
        <input inputMode="decimal" value={v.latitud} onChange={set('latitud')} />
      </Campo>
      <Campo label="Longitud" error={campo('longitud')} ayuda="Por ejemplo -68.8458">
        <input inputMode="decimal" value={v.longitud} onChange={set('longitud')} />
      </Campo>
      <Campo label="Radio (m)" error={campo('radioM')} ayuda="Vacío = 2000 m.">
        <input inputMode="numeric" value={v.radioM} onChange={set('radioM')} />
      </Campo>
    </Panel>
  );
}

function EliminarUbicacion({ u, onCerrar }: { u: Ubicacion; onCerrar: () => void }) {
  const eliminar = useEliminarUbicacion();
  const { error, enviar } = useEnvio();
  return (
    <Panel
      titulo={`Eliminar ${u.nombre}`}
      explicacion="Deja de aparecer en las listas. Los viajes y registros anteriores con este lugar se conservan."
      error={error}
      ocupado={eliminar.isPending}
      textoBoton="Eliminar"
      onCerrar={onCerrar}
      onConfirmar={() => enviar(eliminar.mutateAsync({ id: u.id, versionFila: u.versionFila }), onCerrar)}
    />
  );
}
