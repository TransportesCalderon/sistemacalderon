'use client';

import { useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, CheckCheck, ExternalLink, Import, LoaderCircle, Map as MapaIcono, MapPin, Pencil, Plus, Save, Trash2, TriangleAlert, Undo2, X } from 'lucide-react';
import { ErrorBase } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import type { ActionResult, ErrorAccion } from '@/server/actions/result';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { invalidar } from '@/shared/query/invalidar';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from '@/shared/ui/clases';
import {
  abrirLinkCorto,
  guardarRutaOperacion,
  ubicarPuntosRuta,
  guardarRutaTramo,
  llegadaRuta,
  moverRutaTramo,
  quitarRutaOperacion,
  quitarRutaTramo,
} from '../../actions/rutas.actions';
import { esLinkCorto, esLinkDeMaps, leerLinkMaps, linkCompleto, MAX_PUNTOS, type PuntoRuta } from '../../domain/rutas';
import { useRutasTramo } from '../../queries/hooks';
import type { RutaOperacion as Ruta, RutaTramo } from '../../repositories/rutas.repository';

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
  return <RutasVarias servicioId={servicioId} abierta={abierta} />;
}

const POR: Record<string, string> = { gps: 'por GPS', chofer: 'avisó el chofer', oficina: 'a mano' };

/**
 * Migración 158 · Todas las rutas de la operación, en orden. El chofer ve solo la «en curso»; pasa a la
 * siguiente al llegar al destino (GPS o «Llegué al destino»), o la oficina la pasa a mano.
 */
function RutasVarias({ servicioId, abierta }: { servicioId: number; abierta: boolean }) {
  const { zonaHoraria } = useSesion();
  const qc = useQueryClient();
  const ver = useCan('operacion.rutas:ver');
  const puede = useCan('operacion.rutas:editar') && abierta;
  const { data: rutas, isPending } = useRutasTramo(servicioId, ver);
  const [editando, setEditando] = useState<RutaTramo | 'nueva' | null>(null);
  const [error, setError] = useState<ErrorAccion | null>(null);
  const [ocupado, setOcupado] = useState(false);
  if (!ver || isPending) return null;
  const lista = rutas ?? [];

  const correr = async (p: Promise<{ ok: true } | { ok: false; error: ErrorAccion }>) => {
    setError(null);
    setOcupado(true);
    const r = await p;
    setOcupado(false);
    if (!r.ok) return setError(r.error);
    await invalidar(qc, 'operacion');
  };

  if (editando) {
    const ruta = editando === 'nueva' ? null : editando;
    return (
      <EditorRuta
        servicioId={servicioId}
        ruta={ruta}
        multiple
        titulo={ruta ? `Ruta ${ruta.orden}` : `Ruta ${lista.length + 1} (nueva)`}
        onCerrar={() => setEditando(null)}
      />
    );
  }

  const enCurso = lista.find((r) => r.estado === 'en_curso');
  const hayHechas = lista.some((r) => r.estado === 'hecha');

  return (
    <div className="space-y-2 text-sm">
      <p className="flex items-center gap-2 font-medium text-tinta">
        <MapaIcono className="size-4 text-marca" /> Rutas para el chofer
        <span className="font-normal text-tinta-suave">· el chofer ve solo la que está en curso</span>
      </p>
      {lista.length === 0 && !puede && <p className="text-tinta-suave">Sin ruta para el chofer.</p>}
      {lista.length > 0 && (
        <ol className="space-y-1">
          {lista.map((r, i) => {
            const link = linkCompleto(r.puntos);
            const pendiente = r.estado === 'pendiente';
            return (
              <li
                key={r.id}
                className={cn(
                  'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-2 py-1.5',
                  r.estado === 'en_curso' ? 'border-marca bg-marca-suave/50' : 'border-borde',
                  r.estado === 'hecha' && 'text-tinta-suave',
                )}
              >
                <span className="w-14 shrink-0 font-semibold">Ruta {r.orden}</span>
                <span className="min-w-0 flex-1">
                  {r.puntos[0]?.nombre} → {r.puntos[r.puntos.length - 1]?.nombre}
                  <span className="text-xs text-tinta-suave"> · {r.puntos.length} puntos</span>
                  {r.notas && <span className="block text-xs text-alerta">{r.notas}</span>}
                </span>
                {r.estado === 'en_curso' && <span className="rounded-full bg-marca px-2 py-0.5 text-xs font-medium text-white">En curso</span>}
                {r.estado === 'pendiente' && <span className="rounded-full bg-fondo px-2 py-0.5 text-xs text-tinta-suave">Después</span>}
                {r.estado === 'hecha' && (
                  <span className="text-xs">
                    Llegó {r.llegadaEn ? formatearFechaHora(r.llegadaEn, zonaHoraria) : ''} {r.llegadaPor ? `(${POR[r.llegadaPor]})` : ''}
                  </span>
                )}
                {link && (
                  <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-marca hover:underline">
                    <ExternalLink className="size-3.5" /> Maps
                  </a>
                )}
                {puede && (
                  <span className="flex items-center gap-0.5">
                    <button type="button" onClick={() => setEditando(r)} className="rounded p-1 text-marca hover:bg-hover" title="Editar">
                      <Pencil className="size-3.5" />
                    </button>
                    {pendiente && i > 0 && lista[i - 1]?.estado !== 'hecha' && (
                      <button type="button" disabled={ocupado} onClick={() => void correr(moverRutaTramo({ id: r.id, dir: -1 }))} className="rounded p-1 text-tinta-suave hover:bg-hover" title="Subir">
                        <ArrowUp className="size-3.5" />
                      </button>
                    )}
                    {r.estado !== 'hecha' && i < lista.length - 1 && (
                      <button type="button" disabled={ocupado} onClick={() => void correr(moverRutaTramo({ id: r.id, dir: 1 }))} className="rounded p-1 text-tinta-suave hover:bg-hover" title="Bajar">
                        <ArrowDown className="size-3.5" />
                      </button>
                    )}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {lista.length > 0 && !enCurso && <p className="text-xs text-exito">El chofer terminó todas las rutas.</p>}
      {puede && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <button type="button" onClick={() => setEditando('nueva')} className="inline-flex items-center gap-1 font-medium text-marca hover:underline">
            <Plus className="size-4" /> {lista.length === 0 ? 'Cargar la ruta para el chofer' : 'Agregar otra ruta'}
          </button>
          {enCurso && lista.length > 1 && (
            <button
              type="button"
              disabled={ocupado}
              onClick={() => void correr(llegadaRuta({ servicioId, llego: true }))}
              className="inline-flex items-center gap-1 text-xs text-tinta-suave hover:underline"
              title="Si el GPS no lo detectó y el chofer no avisó"
            >
              <CheckCheck className="size-3.5" /> Llegó al destino de la ruta {enCurso.orden}: pasar a la siguiente
            </button>
          )}
          {hayHechas && (
            <button type="button" disabled={ocupado} onClick={() => void correr(llegadaRuta({ servicioId, llego: false }))} className="inline-flex items-center gap-1 text-xs text-tinta-suave hover:underline">
              <Undo2 className="size-3.5" /> Volver a la ruta anterior
            </button>
          )}
        </div>
      )}
      <ErrorBase error={error} />
    </div>
  );
}
/** Datos que arma el editor (los guarda quien lo usa: por operación o por chofer). */
export interface DatosEditorRuta {
  notas: string;
  puntos: PuntoRuta[];
  linkOriginal: string | null;
}

export function EditorRuta({
  servicioId,
  ruta,
  onCerrar,
  multiple = false,
  titulo = 'Ruta para el chofer',
  onGuardar,
  onQuitar,
  extra,
  onOtra,
}: {
  servicioId: number;
  ruta: Ruta | null;
  onCerrar: () => void;
  multiple?: boolean;
  titulo?: string;
  /** Migración 161: guardar por chofer (si no viene, se guarda por operación). */
  onGuardar?: (d: DatosEditorRuta) => Promise<ActionResult<unknown>>;
  onQuitar?: () => Promise<ActionResult<unknown>>;
  /** Campos de más arriba del aviso (por ejemplo, a qué operación va). */
  extra?: ReactNode;
  /** «Guardar y cargar otra»: después de guardar, abre una ruta nueva en blanco. */
  onOtra?: () => void;
}) {
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
    const lista = leidos.slice(0, MAX_PUNTOS).map((p, i, a) => ({ ...p, nombre: p.nombre || (i === 0 ? 'Partida' : i === a.length - 1 ? 'Destino' : `Parada ${i}`) }));
    // Los que vienen como dirección escrita (sin coordenadas en el link): se ubican por la dirección
    const porDireccion = lista.map((p, i) => ({ p, i })).filter(({ p }) => p.lat === null).slice(0, 4);
    const aproximados: string[] = [];
    if (porDireccion.length > 0) {
      setOcupado('importar');
      setAviso('Ubicando por la dirección los puntos que el link trae sin coordenadas…');
      const r = await ubicarPuntosRuta({ direcciones: porDireccion.map(({ p }) => p.nombre) });
      setOcupado(null);
      if (r.ok)
        porDireccion.forEach(({ p, i }, k) => {
          const c = r.data[k];
          if (c) {
            lista[i] = { ...p, lat: c.lat, lng: c.lng };
            aproximados.push(`${i + 1}`);
          }
        });
    }
    setPuntos(lista);
    setLinkOriginal(link.trim());
    setLink('');
    const faltan = lista.filter((p) => p.lat === null).length;
    setAviso(
      `Se leyeron ${lista.length} puntos.` +
        (aproximados.length > 0 ? ` ${aproximados.length === 1 ? 'El punto' : 'Los puntos'} ${aproximados.join(', ')} se ubicaron por la dirección: revisá en el mapa que estén bien (si no, elegilo y tocá el mapa).` : '') +
        (faltan > 0 ? ` ${faltan} no traen la ubicación: elegilos en la lista y tocá el mapa donde van.` : aproximados.length === 0 ? ' Revisalos en el mapa antes de guardar.' : ''),
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

  const guardar = async (otra = false) => {
    setError(null);
    setOcupado('guardar');
    const r = onGuardar
      ? await onGuardar({ notas, puntos, linkOriginal })
      : multiple
      ? await guardarRutaTramo({ servicioId, id: ruta?.id ?? null, version: ruta?.version ?? null, notas, puntos, linkOriginal })
      : await guardarRutaOperacion({ servicioId, version: ruta?.version ?? null, notas, puntos, linkOriginal });
    setOcupado(null);
    if (!r.ok) return setError(r.error);
    await invalidar(qc, 'operacion');
    if (otra && onOtra) onOtra();
    else onCerrar();
  };

  const quitar = async () => {
    if (!ruta) return;
    setError(null);
    setOcupado('quitar');
    const r = onQuitar ? await onQuitar() : multiple ? await quitarRutaTramo({ id: ruta.id, version: ruta.version }) : await quitarRutaOperacion({ servicioId, version: ruta.version });
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
          <MapaIcono className="size-4 text-marca" /> {titulo}
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

      {extra}

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
        {onOtra && !ruta && (
          <button type="button" className={BOTON_SECUNDARIO} onClick={() => void guardar(true)} disabled={ocupado !== null}>
            <Plus className="size-4" /> Guardar y cargar otra
          </button>
        )}
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
