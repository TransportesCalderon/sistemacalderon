'use client';

import { useEffect, useRef } from 'react';
import type { Map as MapaLeaflet, LayerGroup } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { PuntoZona, ZonaVelocidad } from '../domain/zona-velocidad';

const COLOR = { verificada: '#16a34a', a_verificar: '#f07b08', inactiva: '#9ca3af' } as const;

/**
 * Migración 307 · Los tramos de velocidad en el mapa (Leaflet + OpenStreetMap).
 * Con un tramo en edición: sus puntos se arrastran y un clic en el mapa agrega uno al final.
 */
export function MapaZonas({
  zonas,
  elegida,
  puntos,
  onElegir,
  onMoverPunto,
  onAgregarPunto,
}: {
  zonas: ZonaVelocidad[];
  elegida: number | null;
  puntos: PuntoZona[] | null;
  onElegir: (id: number) => void;
  onMoverPunto: (i: number, p: PuntoZona) => void;
  onAgregarPunto: (p: PuntoZona) => void;
}) {
  const div = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaLeaflet | null>(null);
  const capa = useRef<LayerGroup | null>(null);
  const editar = useRef<LayerGroup | null>(null);
  const encuadrado = useRef<string>('');
  // Los callbacks cambian en cada render: se leen desde una ref para no rearmar el mapa
  const cb = useRef({ onElegir, onMoverPunto, onAgregarPunto, editando: puntos !== null });
  cb.current = { onElegir, onMoverPunto, onAgregarPunto, editando: puntos !== null };

  useEffect(() => {
    let vivo = true;
    void import('leaflet').then((L) => {
      if (!vivo || !div.current) return;
      if (!mapa.current) {
        const m = L.map(div.current, { zoomControl: true }).setView([-32.85, -69.9], 8);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 18,
          attribution: '&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(m);
        m.on('click', (e) => {
          if (cb.current.editando) cb.current.onAgregarPunto({ lat: Math.round(e.latlng.lat * 1e6) / 1e6, lng: Math.round(e.latlng.lng * 1e6) / 1e6 });
        });
        mapa.current = m;
        capa.current = L.layerGroup().addTo(m);
        editar.current = L.layerGroup().addTo(m);
      }
      const m = mapa.current;
      const c = capa.current!;
      c.clearLayers();
      for (const z of zonas) {
        if (!z.geom) continue;
        const sel = z.id === elegida;
        const g = L.geoJSON(z.geom as never, {
          style: { color: COLOR[z.estado], weight: sel ? 3 : 1, fillOpacity: sel ? 0.35 : 0.2 },
        })
          .bindTooltip(`${z.nombre} · ${z.velocidadMax} km/h`)
          .on('click', () => cb.current.onElegir(z.id));
        g.addTo(c);
        if (z.camino) L.geoJSON(z.camino as never, { style: { color: COLOR[z.estado], weight: 2, dashArray: '4 4' } }).addTo(c);
      }
      // Encuadre: la zona elegida, o todas la primera vez
      const clave = elegida ? `z${elegida}` : 'todas';
      if (encuadrado.current !== clave) {
        const fuente = elegida ? zonas.filter((z) => z.id === elegida) : zonas;
        const capas = fuente.filter((z) => z.geom).map((z) => L.geoJSON(z.geom as never));
        if (capas.length > 0) {
          const b = L.featureGroup(capas).getBounds();
          if (b.isValid()) m.fitBounds(b, { padding: [24, 24], maxZoom: 15 });
          encuadrado.current = clave;
        }
      }
    });
    return () => {
      vivo = false;
    };
  }, [zonas, elegida]);

  // Los puntos del tramo en edición
  useEffect(() => {
    let vivo = true;
    void import('leaflet').then((L) => {
      if (!vivo || !editar.current) return;
      const e = editar.current;
      e.clearLayers();
      if (!puntos) return;
      if (puntos.length > 1) L.polyline(puntos.map((p) => [p.lat, p.lng] as [number, number]), { color: '#0f5fa8', weight: 2 }).addTo(e);
      puntos.forEach((p, i) => {
        const etiqueta = i === 0 ? 'Inicio' : i === puntos.length - 1 ? 'Fin' : `Punto ${i + 1}`;
        L.marker([p.lat, p.lng], { draggable: true, title: etiqueta })
          .bindTooltip(etiqueta, { permanent: true, direction: 'top', offset: [0, -10] })
          .on('dragend', (ev) => {
            const ll = (ev.target as { getLatLng: () => { lat: number; lng: number } }).getLatLng();
            cb.current.onMoverPunto(i, { lat: Math.round(ll.lat * 1e6) / 1e6, lng: Math.round(ll.lng * 1e6) / 1e6 });
          })
          .addTo(e);
      });
    });
    return () => {
      vivo = false;
    };
  }, [puntos]);

  useEffect(
    () => () => {
      mapa.current?.remove();
      mapa.current = null;
      capa.current = null;
      editar.current = null;
    },
    [],
  );

  return <div ref={div} className="h-[28rem] w-full overflow-hidden rounded-lg border border-borde" />;
}
