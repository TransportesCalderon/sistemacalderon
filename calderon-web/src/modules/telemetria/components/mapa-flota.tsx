'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map as MapaLeaflet, LayerGroup } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Maximize2, Minimize2 } from 'lucide-react';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { haceTexto, minutosDesde, senalDe, type CamionEnVivo, type DetalleMapa, type Senal } from '../domain/flota.types';

const COLOR: Record<Senal, string> = { vivo: '#16a34a', demorada: '#d97706', sin_senal: '#94a3b8' };
const ESTELA = '#22c55e';

const escapar = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Cuánto de la estela se muestra (minutos hacia atrás). */
export const OPCIONES_ESTELA = [
  { minutos: 30, texto: '30 min' },
  { minutos: 120, texto: '2 h' },
  { minutos: 360, texto: '6 h' },
  { minutos: 1440, texto: '24 h' },
] as const;

export interface CelularEnMapa {
  choferId: number;
  chofer: string;
  numeroOperacion: number | null;
  patente: string | null;
  ts: string;
  latitud: number;
  longitud: number;
}

/** Migración 96: color del programador y del Eco Score del día (lo decide la base). */
const COLOR_NIVEL: Record<string, string> = { verde: '#15803d', naranja: '#ea580c', rojo: '#dc2626' };

/**
 * Mapa de la flota (Leaflet + OpenStreetMap). Cada camión es un punto con su patente y su
 * velocidad; detrás, la estela verde de dónde viene. Al tocarlo se abre su ficha (chofer,
 * velocidad, combustible, viaje y operación). Se puede ver a pantalla completa.
 */
export function MapaFlota({
  camiones,
  detalles = [],
  celulares = [],
  seleccionado,
  onSeleccionar,
  minutosEstela,
  onMinutosEstela,
  zonaHoraria,
}: {
  camiones: CamionEnVivo[];
  /** Migración 84: estela, chofer, viaje y operación de cada camión. */
  detalles?: DetalleMapa[];
  /** Migración 60: celulares de los choferes con carga (sobre todo tractores sin telemetría). */
  celulares?: CelularEnMapa[];
  seleccionado: number | null;
  onSeleccionar: (id: number | null) => void;
  minutosEstela: number;
  onMinutosEstela: (m: number) => void;
  zonaHoraria: string;
}) {
  const marco = useRef<HTMLDivElement>(null);
  const div = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaLeaflet | null>(null);
  const capa = useRef<LayerGroup | null>(null);
  const encuadrado = useRef(false);
  const centrado = useRef<number | null>(null);
  // Ficha abierta: se vuelve a abrir después de cada refresco del mapa
  const abierto = useRef<number | null>(null);
  const redibujando = useRef(false);
  const alElegir = useRef(onSeleccionar);
  alElegir.current = onSeleccionar;
  const [completa, setCompleta] = useState(false);

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
      // Tocar el mapa (fuera de un camión) vuelve a mostrar las estelas de todos
      m.on('click', () => {
        centrado.current = null;
        abierto.current = null;
        alElegir.current(null);
      });
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
  }, [camiones, detalles, celulares, seleccionado]);

  // Pantalla completa: la del navegador si se puede; si no (algunos celulares), el mapa ocupa toda la ventana
  useEffect(() => {
    const alCambiar = () => {
      if (!document.fullscreenElement) setCompleta(false);
      setTimeout(() => mapa.current?.invalidateSize(), 50);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCompleta(false);
    };
    document.addEventListener('fullscreenchange', alCambiar);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('fullscreenchange', alCambiar);
      document.removeEventListener('keydown', tecla);
    };
  }, []);
  useEffect(() => {
    setTimeout(() => mapa.current?.invalidateSize(), 50);
  }, [completa]);

  const alternarCompleta = async () => {
    if (completa) {
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
      setCompleta(false);
      return;
    }
    setCompleta(true);
    await marco.current?.requestFullscreen?.().catch(() => undefined);
  };

  function ficha(c: CamionEnVivo, d: DetalleMapa | undefined): string {
    const min = minutosDesde(c.ts);
    const fila = (k: string, v: string) => `<tr><td style="color:#64748b;padding:1px 8px 1px 0;vertical-align:top">${k}</td><td style="padding:1px 0">${v}</td></tr>`;
    const filas = [
      fila('Chofer', d?.chofer ? `${escapar(d.chofer)}${d.choferFuente === 'asignado' ? ' <span style="color:#64748b">(asignado)</span>' : ''}` : '—'),
      fila(
        'Velocidad',
        c.velocidadKmh === null ? '—' : `<b>${formatearNumero(c.velocidadKmh, 0)} km/h</b>${c.motorEncendido === false ? ' · motor apagado' : ''}`,
      ),
      fila('Última posición', c.ts ? `${escapar(formatearFechaHora(c.ts, zonaHoraria))} <span style="color:#64748b">(${haceTexto(min)})</span>` : '—'),
      fila(
        'Combustible',
        d?.combustible?.litros != null
          ? `<b>≈ ${formatearNumero(d.combustible.litros, 0)} L</b>${d.combustible.pct != null ? ` (${formatearNumero(d.combustible.pct, 0)} %)` : ''}${
              d.combustible.mochilaL ? ` · mochila ${formatearNumero(d.combustible.mochilaL, 0)} L` : ''
            }${c.nivelPct !== null ? `<br><span style="color:#64748b">Sensor tanque principal: ${formatearNumero(c.nivelPct, 0)} %</span>` : ''}`
          : `${c.nivelPct === null ? '—' : `Sensor tanque principal: ${formatearNumero(c.nivelPct, 0)} %${c.nivelL !== null ? ` · ≈ ${formatearNumero(c.nivelL, 0)} L` : ''}`}${
              d?.combustible?.motivo ? `<br><span style="color:#b45309">Sin cálculo: ${escapar(d.combustible.motivo)}</span>` : ''
            }`,
      ),
      fila('Odómetro', c.odometroKm === null ? '—' : `${formatearNumero(c.odometroKm, 0)} km`),
      // Migración 96: lo de hoy (el color lo decide la base)
      fila(
        'Programador hoy',
        d?.hoy?.programadorPct != null
          ? `<b style="color:${COLOR_NIVEL[d.hoy.programadorNivel ?? ''] ?? 'inherit'}">${formatearNumero(d.hoy.programadorPct, 0)} %</b> de los km`
          : '<span style="color:#64748b">— (menos de 10 km hoy o sin dato)</span>',
      ),
      fila(
        'Eco Score',
        d?.hoy?.eco
          ? `<b style="color:${COLOR_NIVEL[d.hoy.eco.nivel ?? ''] ?? 'inherit'}">${formatearNumero(d.hoy.eco.total, 1)}</b> de ${d.hoy.eco.escala}${
              d.hoy.eco.hoy ? ' <span style="color:#64748b">(hoy)</span>' : ` <span style="color:#64748b">(${escapar(d.hoy.eco.fecha.split('-').reverse().join('/'))}${d.hoy.eco.marca === 'tablero' ? ', foto del tablero' : ', último disponible'})</span>`
            }`
          : '<span style="color:#64748b">—</span>',
      ),
    ];
    if (d?.operacion) {
      const o = d.operacion;
      filas.push(
        fila(
          'Operación',
          `<a href="/operacion/operaciones?op=${o.numero}" style="color:#0f5fa8">N° ${o.numero}</a> · ${escapar(o.cliente)}${o.linea ? ` · ${escapar(o.linea)}` : ''}${
            o.producto ? `<br><span style="color:#64748b">${escapar(o.producto)}${o.contenedor ? ` · ${escapar(o.contenedor)}` : ''}</span>` : ''
          }`,
        ),
      );
    }
    if (d?.viaje) filas.push(fila('Viaje del chofer', `<a href="/operacion/viajes-chofer/${d.viaje.id}" style="color:#0f5fa8">${escapar(d.viaje.numero)}</a>`));
    return `<div style="font:12px/1.35 system-ui;min-width:220px">
              <div style="font-weight:700;font-size:13px;margin-bottom:4px">${escapar(c.patente)} <span style="font-weight:400;color:#64748b">${escapar(c.codigoInterno)}</span></div>
              <table>${filas.join('')}</table>
            </div>`;
  }

  function dibujar(L: typeof import('leaflet')) {
    const m = mapa.current;
    const g = capa.current;
    if (!m || !g) return;
    redibujando.current = true;
    g.clearLayers();
    redibujando.current = false;
    const porCamion = new Map(detalles.map((d) => [d.camionId, d]));
    const puntos: [number, number][] = [];

    for (const c of camiones) {
      if (c.latitud === null || c.longitud === null) continue;
      const d = porCamion.get(c.camionId);
      const elegido = c.camionId === seleccionado;

      // Estela: de dónde viene (más transparente cuanto más vieja). Con un camión elegido, solo la suya
      const conEstela = seleccionado === null || elegido;
      const tramo: [number, number][] = conEstela ? (d?.estela ?? []).map((p) => [p.lat, p.lng]) : [];
      const ultimo = tramo[tramo.length - 1];
      if (!ultimo || ultimo[0] !== c.latitud || ultimo[1] !== c.longitud) tramo.push([c.latitud, c.longitud]);
      for (let i = 1; conEstela && i < tramo.length; i++) {
        L.polyline([tramo[i - 1]!, tramo[i]!], {
          color: ESTELA,
          weight: elegido ? 6 : 4,
          opacity: 0.25 + (0.75 * i) / (tramo.length - 1),
          lineCap: 'round',
        }).addTo(g);
      }

      const color = COLOR[senalDe(minutosDesde(c.ts))];
      const anda = (c.velocidadKmh ?? 0) > 2;
      const flecha =
        anda && c.rumbo !== null
          ? `<span style="position:absolute;left:3px;top:-9px;width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:8px solid ${color};transform-origin:5px 17px;transform:rotate(${c.rumbo}deg)"></span>`
          : '';
      const etiqueta = `${escapar(c.patente)}${d?.chofer ? ` · ${escapar(d.chofer.split(',')[0] ?? d.chofer)}` : ''}${anda ? ` (${formatearNumero(c.velocidadKmh ?? 0, 0)} km/h)` : ''}`;
      const icono = L.divIcon({
        className: '',
        iconSize: [0, 0],
        html: `<div style="transform:translate(-8px,-8px);display:flex;align-items:center;gap:4px;white-space:nowrap">
                 <span style="position:relative;flex:none;display:inline-block;width:16px;height:16px;border-radius:9999px;background:${color};border:2px solid #fff;box-shadow:0 0 0 ${elegido ? 3 : 1}px ${elegido ? '#0f5fa8' : 'rgba(0,0,0,.3)'}">${flecha}</span>
                 <span style="font:600 11px/1 system-ui;background:#fff;padding:2px 4px;border-radius:4px;box-shadow:0 1px 2px rgba(0,0,0,.25)">${etiqueta}</span>
               </div>`,
      });
      const marcador = L.marker([c.latitud, c.longitud], { icon: icono, zIndexOffset: elegido ? 1000 : 0 })
        .bindPopup(ficha(c, d), { maxWidth: 320, autoPan: false })
        .on('click', () => alElegir.current(c.camionId))
        .on('popupopen', () => (abierto.current = c.camionId))
        .on('popupclose', () => {
          if (!redibujando.current && abierto.current === c.camionId) abierto.current = null;
        })
        .addTo(g);
      puntos.push([c.latitud, c.longitud]);
      // Centra solo al elegir otro camión (no en cada refresco) y abre su ficha
      if (elegido && centrado.current !== c.camionId) {
        m.setView([c.latitud, c.longitud], Math.max(m.getZoom(), 11));
        centrado.current = c.camionId;
        abierto.current = c.camionId;
      }
      if (abierto.current === c.camionId) marcador.openPopup();
    }
    for (const c of celulares) {
      const texto = `${c.chofer}${c.numeroOperacion ? ` · Op. ${c.numeroOperacion}` : ''} (celular)`;
      const icono = L.divIcon({
        className: '',
        iconSize: [0, 0],
        html: `<div style="transform:translate(-7px,-7px);display:flex;align-items:center;gap:4px;white-space:nowrap">
                 <span style="flex:none;display:inline-block;width:14px;height:14px;border-radius:3px;background:${senalDe(minutosDesde(c.ts)) === 'vivo' ? '#7c3aed' : '#a78bfa'};border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.3)"></span>
                 <span style="font:600 11px/1 system-ui;background:#f5f3ff;color:#5b21b6;padding:2px 4px;border-radius:4px;box-shadow:0 1px 2px rgba(0,0,0,.25)">${escapar(texto)}</span>
               </div>`,
      });
      L.marker([c.latitud, c.longitud], { icon: icono }).addTo(g);
      puntos.push([c.latitud, c.longitud]);
    }
    if (!encuadrado.current && puntos.length > 0) {
      m.fitBounds(L.latLngBounds(puntos), { padding: [40, 40], maxZoom: 11 });
      encuadrado.current = true;
    }
  }

  return (
    <div
      ref={marco}
      className={completa ? 'fixed inset-0 z-[1000] bg-white' : 'relative h-[460px] w-full overflow-hidden rounded-lg border border-borde'}
    >
      <div ref={div} className="h-full w-full" aria-label="Mapa de la flota" />
      <div className="absolute top-3 right-3 z-[1000] flex items-center gap-2">
        {seleccionado !== null && (
          <button
            type="button"
            className="rounded-md bg-white/95 px-2 py-1 text-xs font-medium text-marca shadow"
            onClick={() => {
              centrado.current = null;
              abierto.current = null;
              mapa.current?.closePopup();
              onSeleccionar(null);
            }}
          >
            Ver la estela de todos
          </button>
        )}
        <label className="flex items-center gap-1 rounded-md bg-white/95 px-2 py-1 text-xs text-tinta shadow">
          Estela
          <select
            aria-label="Cuánto de la estela mostrar"
            className="bg-transparent text-xs font-medium outline-none"
            value={minutosEstela}
            onChange={(e) => onMinutosEstela(Number(e.target.value))}
          >
            {OPCIONES_ESTELA.map((o) => (
              <option key={o.minutos} value={o.minutos}>
                {o.texto}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void alternarCompleta()}
          className="inline-flex items-center gap-1 rounded-md bg-white/95 px-2 py-1 text-xs font-medium text-tinta shadow hover:bg-white"
          aria-label={completa ? 'Salir de pantalla completa' : 'Ver el mapa en pantalla completa'}
        >
          {completa ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          {completa ? 'Salir' : 'Pantalla completa'}
        </button>
      </div>
    </div>
  );
}
