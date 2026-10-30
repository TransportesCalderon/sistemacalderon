'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ExternalLink, Import, LoaderCircle, Map as MapaIcono, MapPin, Pencil, Plus, Save, Trash2, TriangleAlert, X } from 'lucide-react';
import { ErrorBase } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import type { ErrorAccion } from '@/server/actions/result';
import { cn } from '@/shared/lib/cn';
import { invalidar } from '@/shared/query/invalidar';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from '@/shared/ui/clases';
import { abrirLinkCorto, guardarRutaOperacion, quitarRutaOperacion } from '../../actions/rutas.actions';
import { esLinkCorto, esLinkDeMaps, leerLinkMaps, linkCompleto, MAX_PUNTOS, type PuntoRuta } from '../../domain/rutas';
import { useRutaOperacion } from '../../queries/hooks';
import type { RutaOperacion as Ruta } from '../../repositories/rutas.repository';

const MapaRuta = dynamic(() => import('./mapa-ruta').then((m) => m.MapaRuta), {
  ssr: false,
  loading: () => <div className="h-80 animate-pulse rounded-lg bg-fondo" />,
});

const INPUT = 'h-9 w-full rounded-md border border-borde bg-panel px-3 text-sm outline-none focus:border-marca';

/**
 * Migración 136: la ruta para el chofer de esta operación (el destino cambia según el cliente,
 * por eso va en cada operación). Telemetría pega el link de Google Maps de siempre.
 */
export function RutaOperacion({ servicioId, abierta }: { servicioId: number; abierta: boolean }) {
  const ver = useCan('operacion.rutas:ver');
  const puede = useCan('operacion.rutas:editar') && abierta;
  const { data: ruta, isPending } = useRutaOperacion(servicioId);
  const [editando, setEditando] = useState(false);
  if (!ver || isPending) return null;
  if (editando) return <EditorRuta servicioId={servicioId} ruta={ruta ?? null} onCerrar={() => setEditando(false)} />;
  const link = ruta ? linkCompleto(ruta.puntos) : null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <MapaIcono className="size-4 text-marca" />
      {ruta ? (
        <>
          <span className="text-tinta">
            Ruta del chofer: <b>{ruta.puntos.length} puntos</b> ({ruta.puntos[0]?.nombre} → {ruta.puntos[ruta.puntos.length - 1]?.nombre})
          </span>
          {ruta.notas && <span className="text-xs text-alerta">{ruta.notas}</span>}
          {link && (
            <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-marca hover:underline">
              <ExternalLink className="size-3.5" /> Ver en Google Maps
            </a>
          )}
          {puede && (
            <button type="button" onClick={() => setEditando(true)} className="inline-flex items-center gap-1 text-xs text-marca hover:underline">
              <Pencil className="size-3.5" /> Editar
            </button>
          )}
        </>
      ) : puede ? (
        <button type="button" onClick={() => setEditando(true)} className="inline-flex items-center gap-1 font-medium text-marca hover:underline">
          <Plus className="size-4" /> Cargar la ruta para el chofer
        </button>
      ) : (
        <span className="text-tinta-suave">Sin ruta para el chofer.</span>
      )}
    </div>
  );
}

function EditorRuta({ servicioId, ruta, onCerrar }: { servicioId: number; ruta: Ruta | null; onCerrar: () => void }) {
  const qc = useQueryClient();
  const [notas, setNotas] = useState(ruta?.notas ?? '');
  const [puntos, setPuntos] = useState<PuntoRuta[]>(ruta?.puntos ?? []);
  const [link, setLink] = useState('');
  const [linkOriginal, setLinkOriginal] = useState<string | null>(ruta?.linkOriginal ?? null);
  const [sel, setSel] = useState<number | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<ErrorAccion | null>(null);
  const [ocupado, setOcupado] = useState<'importar' | 'guardar' | 'quitar' | null>(null);
  const [confirmarQuitar, setConfirmarQuitar] = useState(false);
  const sinUbicar = puntos.filter((p) => p.lat === null).length;

  const importar = async () => {
    setAviso(null);
    setError(null);
    let largo = link.trim();
    if (!esLinkDeMaps(largo)) {
      setAviso('Pegá un link de Google Maps (empieza con https://maps.app.goo.gl/ o https://www.google.com/maps/).');
      return;
    }
    if (esLinkCorto(largo)) {
      setOcupado('importar');
      const r = await abrirLinkCorto({ link: largo });
      setOcupado(null);
      if (!r.ok) return setError(r.error);
      largo = r.data;
    }
    const leidos = leerLinkMaps(largo);
    if (leidos.length < 2) {
      setAviso('No encontré los puntos en ese link. Abrilo en Google Maps, tocá «Compartir», copiá el link y volvé a pegarlo; o marcá los puntos en el mapa.');
      return;
    }
    setPuntos(leidos.slice(0, MAX_PUNTOS).map((p, i, a) => ({ ...p, nombre: p.nombre || (i === 0 ? 'Partida' : i === a.length - 1 ? 'Destino' : `Parada ${i}`) })));
    setLinkOriginal(link.trim());
    setLink('');
    const faltan = leidos.filter((p) => p.lat === null).length;
    setAviso(
      `Se leyeron ${leidos.length} puntos.` +
        (faltan > 0 ? ` ${faltan} no traen la ubicación: elegilos en la lista y tocá el mapa donde van.` : ' Revisalos en el mapa antes de guardar.'),
    );
  };

  const tocarMapa = (lat: number, lng: number) => {
    if (sel !== null && puntos[sel]) {
      setPuntos((ps) => ps.map((p, i) => (i === sel ? { ...p, lat, lng } : p)));
      setSel(null);
      return;
    }
    if (puntos.length >= MAX_PUNTOS) return setAviso(`La ruta puede tener hasta ${MAX_PUNTOS} puntos.`);
    setPuntos((ps) => [...ps, { nombre: ps.length === 0 ? 'Partida' : `Parada ${ps.length}`, lat, lng }]);
  };

  const mover = (i: number, d: -1 | 1) =>
    setPuntos((ps) => {
      const j = i + d;
      if (j < 0 || j >= ps.length) return ps;
      const n = [...ps];
      [n[i], n[j]] = [n[j]!, n[i]!];
      return n;
    });

  const guardar = async () => {
    setError(null);
    setOcupado('guardar');
    const r = await guardarRutaOperacion({ servicioId, version: ruta?.version ?? null, notas, puntos, linkOriginal });
    setOcupado(null);
    if (!r.ok) return setError(r.error);
    await invalidar(qc, 'operacion');
    onCerrar();
  };

  const quitar = async () => {
    if (!ruta) return;
    setError(null);
    setOcupado('quitar');
    const r = await quitarRutaOperacion({ servicioId, version: ruta.version });
    setOcupado(null);
    if (!r.ok) return setError(r.error);
    await invalidar(qc, 'operacion');
    onCerrar();
  };

  const prueba = linkCompleto(puntos);

  return (
    <div className="space-y-3 rounded-lg border border-marca bg-panel p-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 font-medium text-tinta">
          <MapaIcono className="size-4 text-marca" /> Ruta para el chofer
        </p>
        <button type="button" onClick={onCerrar} className="rounded-md p-1 text-tinta-suave hover:bg-hover" aria-label="Cerrar">
          <X className="size-4" />
        </button>
      </div>
      <div className="space-y-1">
        <span className="text-sm font-medium text-tinta">Pegar el link de Google Maps</span>
        <div className="flex gap-2">
          <input className={INPUT} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://maps.app.goo.gl/…" />
          <button type="button" className={BOTON_SECUNDARIO} onClick={() => void importar()} disabled={!link.trim() || ocupado !== null}>
            {ocupado === 'importar' ? <LoaderCircle className="size-4 animate-spin" /> : <Import className="size-4" />} Leer
          </button>
        </div>
        <p className="text-xs text-tinta-suave">El mismo link que hoy se manda por WhatsApp. También se puede tocar el mapa para agregar puntos al final.</p>
      </div>
      {aviso && <p className="rounded-md bg-marca-suave p-2 text-sm text-tinta">{aviso}</p>}

      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        <MapaRuta puntos={puntos} seleccionado={sel} onTocarMapa={tocarMapa} onElegirPunto={(i) => setSel(i === sel ? null : i)} />
        <ol className="max-h-80 space-y-1 overflow-y-auto">
          {puntos.length === 0 && <li className="text-sm text-tinta-suave">Pegá el link o tocá el mapa para agregar la partida, las paradas y el destino.</li>}
          {puntos.map((p, i) => (
            <li key={i} className={cn('flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm', sel === i ? 'border-marca bg-marca-suave' : 'border-borde')}>
              <span className="w-5 shrink-0 text-right text-xs font-semibold text-tinta-suave tabular-nums">{i + 1}</span>
              <input
                className="h-7 min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 text-sm hover:border-borde focus:border-marca focus:outline-none"
                value={p.nombre}
                maxLength={80}
                onChange={(e) => setPuntos((ps) => ps.map((x, k) => (k === i ? { ...x, nombre: e.target.value } : x)))}
              />
              <button
                type="button"
                title={p.lat === null ? 'Sin ubicación: tocá acá y después el mapa' : 'Mover: tocá acá y después el mapa'}
                onClick={() => setSel(sel === i ? null : i)}
                className={cn('rounded p-1 hover:bg-hover', p.lat === null ? 'text-error' : 'text-tinta-suave')}
              >
                {p.lat === null ? <TriangleAlert className="size-3.5" /> : <MapPin className="size-3.5" />}
              </button>
              <button type="button" title="Subir" onClick={() => mover(i, -1)} className="rounded p-1 text-tinta-suave hover:bg-hover">
                <ArrowUp className="size-3.5" />
              </button>
              <button type="button" title="Bajar" onClick={() => mover(i, 1)} className="rounded p-1 text-tinta-suave hover:bg-hover">
                <ArrowDown className="size-3.5" />
              </button>
              <button
                type="button"
                title="Quitar"
                onClick={() => {
                  setPuntos((ps) => ps.filter((_, k) => k !== i));
                  setSel(null);
                }}
                className="rounded p-1 text-tinta-suave hover:bg-hover"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ol>
      </div>
      {sel !== null && <p className="text-sm text-marca">Tocá el mapa donde va el punto {sel + 1}.</p>}
      {sinUbicar > 0 && <p className="text-sm text-error">{sinUbicar} punto(s) sin ubicación: elegilos y tocá el mapa.</p>}

      <label className="block space-y-1 text-sm">
        <span className="font-medium text-tinta">Aviso para el chofer (opcional)</span>
        <textarea
          className="min-h-16 w-full rounded-md border border-borde bg-panel px-3 py-2 text-sm outline-none focus:border-marca"
          value={notas}
          maxLength={500}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="Ej.: con cal no tomar la Ruta 5; puente bajo en…"
        />
      </label>

      <ErrorBase error={error} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={BOTON_PRIMARIO} onClick={() => void guardar()} disabled={ocupado !== null}>
          {ocupado === 'guardar' ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />} Guardar ruta
        </button>
        {prueba && (
          <a href={prueba} target="_blank" rel="noreferrer" className={BOTON_SECUNDARIO}>
            <ExternalLink className="size-4" /> Probar en Google Maps
          </a>
        )}
        <button type="button" className="text-sm text-tinta-suave hover:underline" onClick={onCerrar}>
          Cancelar
        </button>
        {ruta &&
          (confirmarQuitar ? (
            <span className="ml-auto flex items-center gap-2 text-sm">
              ¿Quitar la ruta?
              <button type="button" className="font-medium text-error hover:underline" onClick={() => void quitar()} disabled={ocupado !== null}>
                Sí, quitar
              </button>
              <button type="button" className="text-tinta-suave hover:underline" onClick={() => setConfirmarQuitar(false)}>
                No
              </button>
            </span>
          ) : (
            <button type="button" className="ml-auto inline-flex items-center gap-1 text-sm text-error hover:underline" onClick={() => setConfirmarQuitar(true)}>
              <Trash2 className="size-3.5" /> Quitar ruta
            </button>
          ))}
      </div>
    </div>
  );
}
