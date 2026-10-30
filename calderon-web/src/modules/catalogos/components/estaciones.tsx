'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Fuel, Import, LoaderCircle, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import type { ErrorAccion } from '@/server/actions/result';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { useCan } from '@/modules/core/permissions/can';
import { Cargando, Chip, Encabezado, ErrorLectura, Vacio } from '@/modules/combustible/components/comun/ui';
import { cn } from '@/shared/lib/cn';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import type { Estacion } from '../domain/catalogos.types';
import { useEliminarEstacion, useEstaciones, useGuardarEstacion, usePaises, useProveedores } from '../queries/hooks';
import { abrirLinkEstacion } from '../actions/catalogos.actions';
import { coordenadasDeTexto } from '../domain/ubicacion-link';
import { esLinkCorto, esLinkDeMaps } from '@/modules/logistica/domain/rutas';
import { Panel, TD, TH, useEnvio } from './comun';

/** Migración 143: desde esta versión se guarda el punto de la estación. */
const VERSION_UBICACION = 143;

const MapaRuta = dynamic(() => import('@/modules/logistica/components/rutas/mapa-ruta').then((m) => m.MapaRuta), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse rounded-lg bg-fondo" />,
});

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
  const conMapa = useBaseTiene(VERSION_UBICACION);
  const sinUbicar = (data ?? []).filter((e) => !e.esTanquePropio && e.latitud === null).length;

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

      {conMapa && sinUbicar > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-alerta/30 bg-alerta-suave p-3 text-sm text-alerta">
          <MapPin className="mt-0.5 size-4 shrink-0" />
          {sinUbicar === 1 ? '1 estación no tiene' : `${sinUbicar} estaciones no tienen`} su lugar en el mapa: sin eso, el chofer no recibe el aviso de cuántos litros
          cargar al llegar. Tocá «Editar» y pegá el link de Google Maps de la estación (o marcala en el mapa).
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
                {conMapa && <th className={TH}>En el mapa</th>}
                {puede && <th className={TH} />}
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {filas.map((e) => {
                const modo = abierto && abierto.modo !== 'nuevo' && abierto.e.id === e.id ? abierto.modo : null;
                return (
                  <FilaEstacion key={e.id} e={e} proveedor={proveedor(e.proveedorId)} pais={pais(e.pais)} puede={puede} conMapa={conMapa} modo={modo} onAbrir={setAbierto} />
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
  conMapa,
  modo,
  onAbrir,
}: {
  e: Estacion;
  proveedor: string | null;
  pais: string;
  puede: boolean;
  conMapa: boolean;
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
        {conMapa && (
          <td className={TD}>
            {e.latitud !== null ? (
              <Chip tono="exito">
                <MapPin className="size-3" /> Ubicada
              </Chip>
            ) : e.esTanquePropio ? (
              '—'
            ) : (
              <Chip tono="alerta">Sin ubicar</Chip>
            )}
          </td>
        )}
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
          <td colSpan={6} className="px-3 pb-3">
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
  const conMapa = useBaseTiene(VERSION_UBICACION);
  const [punto, setPunto] = useState<{ lat: number; lng: number } | null>(
    e?.latitud != null && e.longitud != null ? { lat: e.latitud, lng: e.longitud } : null,
  );
  const set = (k: 'codigo' | 'nombre' | 'proveedorId' | 'pais') => (ev: { target: { value: string } }) => setV({ ...v, [k]: ev.target.value });

  return (
    <Panel
      titulo={e ? `Editar ${e.nombre}` : 'Nueva estación'}
      explicacion="El país define la zona horaria de la carga y, con ella, qué día de cotización se usa."
      error={error}
      ocupado={guardar.isPending}
      textoBoton={e ? 'Guardar cambios' : 'Dar de alta'}
      onCerrar={onCerrar}
      onConfirmar={() =>
        enviar(
          guardar.mutateAsync({
            ...v,
            id: e?.id ?? null,
            versionFila: e?.versionFila ?? null,
            ...(conMapa ? { latitud: punto?.lat ?? null, longitud: punto?.lng ?? null } : {}),
          }),
          onCerrar,
        )
      }
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
      {conMapa && <UbicacionEstacion nombre={v.nombre} punto={punto} onCambiar={setPunto} />}
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

/**
 * Migración 143: dónde está la estación. Se pega el link de Google Maps de la estación (o sus
 * coordenadas) o se toca el mapa. Con eso, el chofer recibe el aviso de cuántos litros cargar.
 */
function UbicacionEstacion({
  nombre,
  punto,
  onCambiar,
}: {
  nombre: string;
  punto: { lat: number; lng: number } | null;
  onCambiar: (p: { lat: number; lng: number } | null) => void;
}) {
  const [texto, setTexto] = useState('');
  const [leyendo, setLeyendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<ErrorAccion | null>(null);

  const leer = async () => {
    setAviso(null);
    setError(null);
    let t = texto.trim();
    if (esLinkDeMaps(t) && esLinkCorto(t)) {
      setLeyendo(true);
      const r = await abrirLinkEstacion({ link: t });
      setLeyendo(false);
      if (!r.ok) return setError(r.error);
      t = r.data;
    }
    const c = coordenadasDeTexto(t);
    if (!c) {
      setAviso('No encontré el lugar en lo que pegaste. En Google Maps buscá la estación, tocá «Compartir» → «Copiar vínculo» y pegalo acá; o tocá el mapa donde está.');
      return;
    }
    onCambiar({ lat: Math.round(c.lat * 1e6) / 1e6, lng: Math.round(c.lng * 1e6) / 1e6 });
    setTexto('');
  };

  return (
    <div className="space-y-2 sm:col-span-2 lg:col-span-3">
      <p className="flex items-center gap-2 text-sm font-medium text-tinta">
        <MapPin className="size-4 text-marca" /> Lugar en el mapa{' '}
        <span className="font-normal text-tinta-suave">(para avisarle al chofer cuántos litros cargar cuando llega)</span>
      </p>
      <div className="flex gap-2">
        <input
          className="h-9 w-full rounded-md border border-borde bg-panel px-3 text-sm outline-none focus:border-marca"
          value={texto}
          onChange={(ev) => setTexto(ev.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === 'Enter') {
              ev.preventDefault();
              void leer();
            }
          }}
          placeholder="Link de Google Maps de la estación (o -32.8895, -68.8458)"
        />
        <button type="button" className={BOTON_SECUNDARIO} onClick={() => void leer()} disabled={!texto.trim() || leyendo}>
          {leyendo ? <LoaderCircle className="size-4 animate-spin" /> : <Import className="size-4" />} Leer
        </button>
      </div>
      {aviso && <p className="rounded-md bg-marca-suave p-2 text-sm text-tinta">{aviso}</p>}
      {error && <p className="text-sm text-error">{error.mensaje}</p>}
      <MapaRuta
        puntos={punto ? [{ nombre: nombre || 'Estación', lat: punto.lat, lng: punto.lng }] : []}
        seleccionado={null}
        onTocarMapa={(lat, lng) => onCambiar({ lat, lng })}
        alto="h-64"
      />
      <p className="flex flex-wrap items-center gap-3 text-xs text-tinta-suave">
        {punto ? (
          <>
            <span>
              Ubicada en {punto.lat}, {punto.lng}. Para corregirla, tocá el mapa donde está.
            </span>
            <button type="button" className="text-error hover:underline" onClick={() => onCambiar(null)}>
              Quitar la ubicación
            </button>
          </>
        ) : (
          <span>Sin ubicar: pegá el link o tocá el mapa donde está la estación.</span>
        )}
      </p>
    </div>
  );
}
