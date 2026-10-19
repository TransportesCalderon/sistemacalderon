'use client';

import { useEffect, useRef } from 'react';
import type { Map as MapaLeaflet, LayerGroup } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { minutosDesde, senalDe, type CamionEnVivo, type Senal } from '../domain/flota.types';

const COLOR: Record<Senal, string> = { vivo: '#16a34a', demorada: '#d97706', sin_senal: '#94a3b8' };

const escapar = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Mapa de la flota (Leaflet + OpenStreetMap). Cada camión es un punto con su patente; el color
 * indica si la señal está al día. Leaflet se carga solo en el navegador.
 */
export function MapaFlota({
  camiones,
  seleccionado,
  onSeleccionar,
}: {
  camiones: CamionEnVivo[];
  seleccionado: number | null;
  onSeleccionar: (id: number) => void;
}) {
  const div = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaLeaflet | null>(null);
  const capa = useRef<LayerGroup | null>(null);
  const encuadrado = useRef(false);
  const alElegir = useRef(onSeleccionar);
  alElegir.current = onSeleccionar;

  // Crea el mapa una sola vez
  useEffect(() => {
    let vivo = true;
    void import('leaflet').then((L) => {
      if (!vivo || !div.current || mapa.current) return;
      const m = L.map(div.current, { zoomControl: true, attributionControl: true }).setView([-33.0, -69.8], 7);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(m);
      mapa.current = m;
      capa.current = L.layerGroup().addTo(m);
      dibujar(L);
    });
    return () => {
      vivo = false;
      mapa.current?.remove();
      mapa.current = null;
      capa.current = null;
      encuadrado.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redibuja cuando cambian los datos o la selección
  useEffect(() => {
    if (!mapa.current) return;
    void import('leaflet').then((L) => dibujar(L));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camiones, seleccionado]);

  function dibujar(L: typeof import('leaflet')) {
    const m = mapa.current;
    const g = capa.current;
    if (!m || !g) return;
    g.clearLayers();
    const puntos: [number, number][] = [];
    for (const c of camiones) {
      if (c.latitud === null || c.longitud === null) continue;
      const color = COLOR[senalDe(minutosDesde(c.ts))];
      const elegido = c.camionId === seleccionado;
      const icono = L.divIcon({
        className: '',
        iconSize: [0, 0],
        html: `<div style="transform:translate(-8px,-8px);display:flex;align-items:center;gap:4px;white-space:nowrap">
                 <span style="flex:none;display:inline-block;width:16px;height:16px;border-radius:9999px;background:${color};border:2px solid #fff;box-shadow:0 0 0 ${elegido ? 3 : 1}px ${elegido ? '#0f5fa8' : 'rgba(0,0,0,.3)'}"></span>
                 <span style="font:600 11px/1 system-ui;background:#fff;padding:2px 4px;border-radius:4px;box-shadow:0 1px 2px rgba(0,0,0,.25)">${escapar(c.patente)}</span>
               </div>`,
      });
      L.marker([c.latitud, c.longitud], { icon: icono, zIndexOffset: elegido ? 1000 : 0 })
        .on('click', () => alElegir.current(c.camionId))
        .addTo(g);
      puntos.push([c.latitud, c.longitud]);
      if (elegido) m.setView([c.latitud, c.longitud], Math.max(m.getZoom(), 11));
    }
    if (!encuadrado.current && puntos.length > 0) {
      m.fitBounds(L.latLngBounds(puntos), { padding: [40, 40], maxZoom: 11 });
      encuadrado.current = true;
    }
  }

  return <div ref={div} className="h-[460px] w-full overflow-hidden rounded-lg border border-borde" aria-label="Mapa de la flota" />;
}
