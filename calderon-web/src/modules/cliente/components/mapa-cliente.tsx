'use client';

import { useEffect, useRef } from 'react';
import type { LatLngBounds, LayerGroup, Map as MapaLeaflet, Marker } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { haceTexto, minutosDesde, senalDe } from '@/modules/telemetria/domain/flota.types';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { cargaUnidad, tienePosicion, tituloUnidad, type UnidadCliente } from '../domain/seguimiento';

const escapar = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Color del punto: en viaje con GPS al día, GPS demorado (más de 30 min) o semi esperando en una base (o sin posición). */
export const COLOR_UNIDAD = { vivo: '#0f5fa8', demorada: '#d97706', base: '#64748b' } as const;

export function colorUnidad(u: UnidadCliente): string {
  if (u.enBase || u.ts === null) return COLOR_UNIDAD.base;
  return senalDe(minutosDesde(u.ts)) === 'vivo' ? COLOR_UNIDAD.vivo : COLOR_UNIDAD.demorada;
}

const ETIQUETA = 'font:600 11px/1 system-ui;background:#fff;padding:2px 4px;border-radius:4px;box-shadow:0 1px 2px rgba(0,0,0,.25);white-space:nowrap';

/** Lo mismo que la tarjeta de la lista, nada más. */
function ficha(u: UnidadCliente, zona: string): string {
  const filas = [`<b>${escapar(tituloUnidad(u))}</b>`];
  if (u.enBase) filas.push(`En ${escapar(u.lugar ?? 'la base')}, esperando el próximo tractor`);
  else filas.push(`Semi ${escapar(u.semi ?? '—')}`, `Chofer: ${escapar(u.chofer ?? '—')}`);
  const carga = cargaUnidad(u);
  if (carga) filas.push(escapar(carga));
  filas.push(
    `<span style="color:#64748b">${u.enBase ? 'Desde' : 'Posición de'} ${escapar(formatearFechaHora(u.ts, zona))} (${haceTexto(minutosDesde(u.ts))})</span>`,
  );
  return `<div style="font:12px/1.5 system-ui;min-width:190px">${filas.join('<br>')}</div>`;
}

/**
 * Migración 288 · El mapa del usuario de un cliente (Leaflet + OpenStreetMap): un punto por camión con su
 * carga, con la patente al lado. Al tocarlo, la ficha. Encuadra solo cuando entra o sale un camión: las
 * actualizaciones de cada minuto no mueven lo que el cliente está mirando.
 */
export function MapaCliente({
  unidades,
  marcada,
  foco,
  onTocar,
  zona,
}: {
  unidades: UnidadCliente[];
  /** La que está elegida en la lista (se resalta). */
  marcada: number | null;
  /** Pedido de ir a una unidad (cada toque en la lista suma una vez). */
  foco: { id: number; vez: number } | null;
  onTocar: (id: number) => void;
  zona: string;
}) {
  const div = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaLeaflet | null>(null);
  const capa = useRef<LayerGroup | null>(null);
  const limites = useRef<LatLngBounds | null>(null);
  const encuadrados = useRef<string | null>(null);
  const atendido = useRef<string | null>(null);
  const abierta = useRef<number | null>(null);
  const redibujando = useRef(false);
  const alTocar = useRef(onTocar);
  alTocar.current = onTocar;

  useEffect(() => {
    let vivo = true;
    void import('leaflet').then((L) => {
      if (!vivo || !div.current) return;
      if (!mapa.current) {
        const m = L.map(div.current, { zoomControl: true }).setView([-33.0, -69.8], 6);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 18,
          attribution: '&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(m);
        mapa.current = m;
        capa.current = L.layerGroup().addTo(m);
      }
      const m = mapa.current;
      const c = capa.current!;
      redibujando.current = true;
      c.clearLayers();
      redibujando.current = false;

      // Dos contenedores en el mismo camión (o dos semis en la misma base) van en un solo punto
      const grupos = new Map<string, (UnidadCliente & { lat: number; lng: number })[]>();
      for (const u of unidades.filter(tienePosicion)) {
        const clave = `${u.lat.toFixed(5)},${u.lng.toFixed(5)}`;
        grupos.set(clave, [...(grupos.get(clave) ?? []), u]);
      }
      const puntos: [number, number][] = [];
      const porUnidad = new Map<number, Marker>();
      for (const grupo of grupos.values()) {
        const u = grupo[0]!;
        const elegido = grupo.some((x) => x.id === marcada);
        const punto = `<span style="flex:none;display:inline-block;width:16px;height:16px;border-radius:9999px;background:${colorUnidad(u)};border:2px solid #fff;box-shadow:0 0 0 ${elegido ? 3 : 1}px ${elegido ? '#0f5fa8' : 'rgba(0,0,0,.3)'}"></span>`;
        const etiqueta = `${escapar(tituloUnidad(u))}${grupo.length > 1 ? ` (${grupo.length})` : ''}`;
        const icono = L.divIcon({
          className: '',
          iconSize: [0, 0],
          html: `<div style="transform:translate(-8px,-8px);display:flex;align-items:center;gap:4px;white-space:nowrap">${punto}<span style="${ETIQUETA}">${etiqueta}</span></div>`,
        });
        const marcador = L.marker([u.lat, u.lng], { icon: icono, zIndexOffset: elegido ? 1000 : 0 })
          .bindPopup(grupo.map((x) => ficha(x, zona)).join('<hr style="margin:6px 0;border:0;border-top:1px solid #e2e8f0">'), {
            maxWidth: 300,
            autoPan: false,
          })
          .on('click', () => alTocar.current(u.id))
          .on('popupopen', () => (abierta.current = u.id))
          .on('popupclose', () => {
            if (!redibujando.current && abierta.current === u.id) abierta.current = null;
          })
          .addTo(c);
        puntos.push([u.lat, u.lng]);
        for (const x of grupo) porUnidad.set(x.id, marcador);
      }
      limites.current = puntos.length > 0 ? L.latLngBounds(puntos) : null;

      // Encuadra todo cuando cambian los camiones del mapa (la primera vez, o si entró o salió uno)
      const ids = [...porUnidad.keys()].sort((a, b) => a - b).join(',');
      if (ids !== encuadrados.current) {
        encuadrados.current = ids;
        if (puntos.length > 1) m.fitBounds(L.latLngBounds(puntos), { padding: [32, 32], maxZoom: 12 });
        else if (puntos.length === 1) m.setView(puntos[0]!, 11);
      }
      // Tocó una tarjeta: va a esa unidad y abre su ficha
      let paraAbrir = abierta.current !== null ? (porUnidad.get(abierta.current) ?? null) : null;
      const pedido = foco ? `${foco.id}:${foco.vez}` : null;
      if (foco && pedido !== atendido.current) {
        atendido.current = pedido;
        const marcador = porUnidad.get(foco.id);
        if (marcador) {
          m.setView(marcador.getLatLng(), Math.max(m.getZoom(), 11));
          paraAbrir = marcador;
        }
      }
      paraAbrir?.openPopup();
    });
    return () => {
      vivo = false;
    };
  }, [unidades, marcada, foco, zona]);

  useEffect(
    () => () => {
      mapa.current?.remove();
      mapa.current = null;
      capa.current = null;
    },
    [],
  );

  return (
    <div id="mapa-cliente" className="relative h-[55vh] min-h-[320px] w-full overflow-hidden rounded-xl border border-borde lg:h-[calc(100dvh-230px)]">
      <div ref={div} className="h-full w-full" aria-label="Mapa con los camiones que llevan tu carga" />
      <button
        type="button"
        className="absolute top-3 right-3 z-[1000] rounded-md bg-white/95 px-2 py-1 text-xs font-medium text-marca shadow"
        onClick={() => {
          if (limites.current) mapa.current?.fitBounds(limites.current, { padding: [32, 32], maxZoom: 12 });
        }}
      >
        Ver todos
      </button>
    </div>
  );
}
