'use client';

import { useEffect, useRef } from 'react';
import type { Map as MapaLeaflet, LayerGroup } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { PuntoRuta } from '../../domain/rutas';

const escapar = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Migración 135: mapa de una ruta (Leaflet + OpenStreetMap). Puntos numerados en orden (verde la
 * partida, rojo el destino) unidos por una línea. Tocar el mapa avisa dónde (para agregar o ubicar
 * un punto).
 */
export function MapaRuta({
  puntos,
  seleccionado,
  onTocarMapa,
  onElegirPunto,
  alto = 'h-80',
}: {
  puntos: PuntoRuta[];
  seleccionado: number | null;
  onTocarMapa?: (lat: number, lng: number) => void;
  onElegirPunto?: (i: number) => void;
  alto?: string;
}) {
  const div = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaLeaflet | null>(null);
  const capa = useRef<LayerGroup | null>(null);
  const encuadre = useRef('');
  const tocar = useRef(onTocarMapa);
  tocar.current = onTocarMapa;
  const elegir = useRef(onElegirPunto);
  elegir.current = onElegirPunto;

  useEffect(() => {
    let vivo = true;
    void import('leaflet').then((L) => {
      if (!vivo || !div.current || mapa.current) return;
      const m = L.map(div.current, { zoomControl: true }).setView([-33.0, -69.8], 7);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(m);
      m.on('click', (e) => tocar.current?.(Math.round(e.latlng.lat * 1e6) / 1e6, Math.round(e.latlng.lng * 1e6) / 1e6));
      mapa.current = m;
      capa.current = L.layerGroup().addTo(m);
      dibujar(L);
    });
    return () => {
      vivo = false;
      mapa.current?.remove();
      mapa.current = null;
      capa.current = null;
      encuadre.current = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapa.current) return;
    void import('leaflet').then((L) => dibujar(L));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puntos, seleccionado]);

  function dibujar(L: typeof import('leaflet')) {
    const m = mapa.current;
    const c = capa.current;
    if (!m || !c) return;
    c.clearLayers();
    const ubicados = puntos.map((p, i) => ({ p, i })).filter((x) => x.p.lat !== null && x.p.lng !== null);
    const linea = ubicados.map((x) => [x.p.lat!, x.p.lng!] as [number, number]);
    if (linea.length > 1) L.polyline(linea, { color: '#f07b08', weight: 4, opacity: 0.8, dashArray: '8 6' }).addTo(c);
    for (const { p, i } of ubicados) {
      const color = i === 0 ? '#16a34a' : i === puntos.length - 1 ? '#dc2626' : '#0f5fa8';
      const sel = i === seleccionado;
      const icono = L.divIcon({
        className: '',
        html: `<div style="background:${color};color:#fff;border:2px solid ${sel ? '#111' : '#fff'};border-radius:9999px;width:${sel ? 30 : 26}px;height:${sel ? 30 : 26}px;display:grid;place-items:center;font:600 12px system-ui;box-shadow:0 1px 3px rgba(0,0,0,.4)">${i + 1}</div>`,
        iconSize: [sel ? 30 : 26, sel ? 30 : 26],
        iconAnchor: [sel ? 15 : 13, sel ? 15 : 13],
      });
      L.marker([p.lat!, p.lng!], { icon: icono, title: p.nombre })
        .bindTooltip(escapar(`${i + 1}. ${p.nombre}`))
        .on('click', () => elegir.current?.(i))
        .addTo(c);
    }
    // Encuadra cuando cambian los puntos ubicados (no al seleccionar)
    const clave = linea.map((x) => x.join(',')).join('|');
    if (clave && clave !== encuadre.current) {
      encuadre.current = clave;
      if (linea.length === 1) m.setView(linea[0]!, 12);
      else m.fitBounds(L.latLngBounds(linea), { padding: [30, 30] });
    }
  }

  return <div ref={div} className={`${alto} w-full overflow-hidden rounded-lg border border-borde`} />;
}
