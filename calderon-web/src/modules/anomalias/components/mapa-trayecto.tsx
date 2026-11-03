'use client';

import { useEffect, useRef } from 'react';
import type { Map as MapaLeaflet, LayerGroup } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { TramoVelocidad } from '../domain/alerta.types';

/** Colores de cada tramo (se repiten si hay más). */
const COLORES = ['#dc2626', '#f07b08', '#7c3aed', '#0f5fa8', '#16a34a'];

/**
 * Migración 175 · El trayecto donde el camión pasó la velocidad máxima (Leaflet + OpenStreetMap).
 * Una línea por tramo, con su color; los puntos por encima del límite van marcados.
 */
export function MapaTrayecto({ tramos, limite, zona }: { tramos: TramoVelocidad[]; limite: number; zona: string }) {
  const div = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaLeaflet | null>(null);
  const capa = useRef<LayerGroup | null>(null);

  useEffect(() => {
    let vivo = true;
    void import('leaflet').then((L) => {
      if (!vivo || !div.current) return;
      if (!mapa.current) {
        const m = L.map(div.current, { zoomControl: true }).setView([-33.0, -69.8], 7);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 18,
          attribution: '&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(m);
        mapa.current = m;
        capa.current = L.layerGroup().addTo(m);
      }
      const m = mapa.current;
      const c = capa.current!;
      c.clearLayers();
      const todos: [number, number][] = [];
      tramos.forEach((t, i) => {
        const color = COLORES[i % COLORES.length]!;
        const linea = t.puntos.map((p) => [p.lat, p.lng] as [number, number]);
        todos.push(...linea);
        if (linea.length > 1) L.polyline(linea, { color, weight: 5, opacity: 0.85 }).addTo(c);
        for (const p of t.puntos) {
          if (p.kmh === null || p.kmh <= limite) continue;
          const hora = new Date(p.ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: zona });
          L.circleMarker([p.lat, p.lng], { radius: 5, color, fillColor: color, fillOpacity: 1, weight: 1 })
            .bindTooltip(`${hora} · ${Math.round(p.kmh)} km/h`)
            .addTo(c);
        }
      });
      if (todos.length > 1) m.fitBounds(L.latLngBounds(todos), { padding: [24, 24], maxZoom: 14 });
      else if (todos.length === 1) m.setView(todos[0]!, 13);
    });
    return () => {
      vivo = false;
    };
  }, [tramos, limite, zona]);

  useEffect(
    () => () => {
      mapa.current?.remove();
      mapa.current = null;
      capa.current = null;
    },
    [],
  );

  return <div ref={div} className="h-72 w-full overflow-hidden rounded-lg border border-borde" />;
}
