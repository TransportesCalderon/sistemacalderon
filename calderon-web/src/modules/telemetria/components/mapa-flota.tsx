'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map as MapaLeaflet, LayerGroup } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CloudSun, Group, Maximize2, Minimize2, Ungroup } from 'lucide-react';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { NIVEL_HEX } from '@/shared/ui/niveles';
import { FUENTE_CONSUMO_MES, haceTexto, minutosDesde, senalDe, type CamionEnVivo, type DetalleMapa, type EstadoMotor } from '../domain/flota.types';
import { RankingMapa } from './ranking-mapa';
import {
  CAPAS_CLIMA,
  ESCALA_VIENTO,
  climaCercano,
  colorPrecipitacion,
  colorTemperatura,
  grillaViento,
  redondearZona,
  textoClima,
  VERSION_CLIMA_MAPA,
  type CapaClima,
  type ClimaMapa,
  type ZonaMapa,
} from '../domain/clima.types';
import { useClimaMapa } from '../queries/hooks';
import { iniciarVientoAnimado } from './viento-animado';
import { ubicarEtiquetas } from '../domain/ubicar-etiquetas';

/** Migración 112: verde en marcha, rojo apagado, gris sin señal o sin dato del motor (el estado lo decide la base). */
const COLOR: Record<EstadoMotor, string> = { en_marcha: '#16a34a', apagado: '#dc2626', sin_senal: '#94a3b8', sin_dato: '#94a3b8' };
const ESTELA = '#22c55e';
/** Camiones a menos de esta distancia en la pantalla (px) se juntan en un círculo con la cantidad. */
const RADIO_GRUPO = 48;

/** Dónde va un camión en la vista desagrupada (posición del punto y de su nombre, en px respecto del punto). */
type Lugar = { pos: [number, number]; lx: number; ly: number; guia: boolean; w: number; h: number };

const ETIQUETA_CAMION = 'font:600 11px/1 system-ui;background:#fff;padding:2px 4px;border-radius:4px;box-shadow:0 1px 2px rgba(0,0,0,.25);white-space:nowrap';
const ETIQUETA_CELULAR = 'font:600 11px/1 system-ui;background:#f5f3ff;color:#5b21b6;padding:2px 4px;border-radius:4px;box-shadow:0 1px 2px rgba(0,0,0,.25);white-space:nowrap';
const textoCelular = (c: CelularEnMapa) => `${c.chofer}${c.numeroOperacion ? ` · Op. ${c.numeroOperacion}` : ''} (celular)`;

/** Ancho del nombre en pantalla (px), con la misma letra que la etiqueta. */
let lienzo: CanvasRenderingContext2D | null = null;
function anchoTexto(t: string): number {
  if (typeof document === 'undefined') return t.length * 6.5;
  lienzo ??= document.createElement('canvas').getContext('2d');
  if (!lienzo) return t.length * 6.5;
  lienzo.font = '600 11px system-ui, sans-serif';
  return Math.ceil(lienzo.measureText(t).width);
}

/** Punto y nombre separados (vista desagrupada); con una línea guía si el nombre quedó lejos. */
function htmlEnLugar(punto: string, mitad: number, etiqueta: string, estilo: string, l: Lugar): string {
  const ax = l.lx < 0 ? l.lx + l.w : l.lx;
  const ay = l.ly + l.h / 2;
  const linea = l.guia
    ? `<svg width="1" height="1" style="position:absolute;left:0;top:0;overflow:visible;pointer-events:none"><line x1="0" y1="0" x2="${ax}" y2="${ay}" stroke="#475569" stroke-width="1.2" opacity=".8"/></svg>`
    : '';
  return `<div style="position:relative;width:0;height:0">${linea}
            <div style="position:absolute;left:${-mitad}px;top:${-mitad}px;display:flex">${punto}</div>
            <span style="position:absolute;left:${l.lx}px;top:${l.ly}px;box-sizing:border-box;width:${l.w}px;height:${l.h}px;${estilo}">${etiqueta}</span>
          </div>`;
}

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
const ABUSIVO = '#dc2626';
// Migración 109: verde desde 90, amarillo desde 80 (la base devuelve «naranja» para el amarillo)
const COLOR_NIVEL: Record<string, string> = NIVEL_HEX; // Sprint 0 · T04: shared/ui/niveles.ts

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
  // Para redibujar al hacer zoom con los datos de ahora (los camiones juntos se apilan según el zoom)
  const redibujar = useRef<(L: typeof import('leaflet')) => void>(() => undefined);
  const [completa, setCompleta] = useState(false);
  // Agrupados (círculo con la cantidad) o desagrupados (cada camión en su lugar, sin pisarse)
  const [agrupar, setAgrupar] = useState(true);
  const [rankingAbierto, setRankingAbierto] = useState(false);
  // Migración 182: capas de clima (Open-Meteo) y la hora que se mira (0 = ahora, hasta +24 h)
  const conClima = useBaseTiene(VERSION_CLIMA_MAPA);
  const [capaClima, setCapaClima] = useState<CapaClima>('');
  const [horaClima, setHoraClima] = useState(0);
  const [fondoViento, setFondoViento] = useState(false);
  const [zona, setZona] = useState<ZonaMapa | null>(null);
  const climaCapa = useRef<LayerGroup | null>(null);
  const capaClimaRef = useRef<CapaClima>('');
  capaClimaRef.current = capaClima;
  const clima = useClimaMapa(capaClima ? zona : null);
  const climaRef = useRef<ClimaMapa | null>(null);
  // Con el viento animado no hay flechas para tocar: el clima del lugar donde está el mouse va en la barra
  const [aqui, setAqui] = useState<string | null>(null);
  const horaRef = useRef(0);
  horaRef.current = horaClima;
  climaRef.current = capaClima ? (clima.data ?? null) : null;
  const leerZona = (m: MapaLeaflet) => {
    const b = m.getBounds();
    const z = redondearZona({ sur: b.getSouth(), oeste: b.getWest(), norte: b.getNorth(), este: b.getEast() });
    setZona((a) => (a && a.sur === z.sur && a.oeste === z.oeste && a.norte === z.norte && a.este === z.este ? a : z));
  };
  const alternarRanking = () => setRankingAbierto((a) => !a);

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
      // Migración 182: el clima va debajo de los camiones
      m.createPane('clima').style.zIndex = '350';
      climaCapa.current = L.layerGroup().addTo(m);
      capa.current = L.layerGroup().addTo(m);
      m.on('moveend', () => {
        if (capaClimaRef.current) leerZona(m);
      });
      m.on('mousemove', (e) => {
        if (!capaClimaRef.current) return;
        const p = climaCercano(climaRef.current, e.latlng.lat, e.latlng.lng);
        setAqui(p ? textoClima(p, horaRef.current) : null);
      });
      m.on('mouseout', () => setAqui(null));
      // Tocar el mapa (fuera de un camión) vuelve a mostrar las estelas de todos
      m.on('click', () => {
        centrado.current = null;
        abierto.current = null;
        alElegir.current(null);
      });
      m.on('zoomend', () => setTimeout(() => redibujar.current(L), 0));
      dibujar(L);
    });
    return () => {
      vivo = false;
      mapa.current?.remove();
      mapa.current = null;
      capa.current = null;
      climaCapa.current = null;
      encuadrado.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redibuja cuando cambian los datos o la selección
  useEffect(() => {
    if (!mapa.current) return;
    void import('leaflet').then((L) => dibujar(L));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camiones, detalles, celulares, seleccionado, agrupar]);

  // Migración 182: al prender una capa se pide el clima de la zona que se ve
  useEffect(() => {
    if (capaClima && mapa.current) leerZona(mapa.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capaClima]);

  // Migración 182: dibuja la capa de clima elegida, en la hora elegida
  useEffect(() => {
    const g = climaCapa.current;
    if (!g) return;
    g.clearLayers();
    const datos = clima.data;
    if (!capaClima || !datos) return;
    // Viento: ráfagas animadas (no flechas)
    if (capaClima === 'viento') {
      if (!mapa.current) return;
      return iniciarVientoAnimado(mapa.current, grillaViento(datos, Math.min(horaClima, Math.max(0, datos.horas.length - 1))), fondoViento);
    }
    void import('leaflet').then((L) => {
      if (!climaCapa.current) return;
      const h = Math.min(horaClima, Math.max(0, datos.horas.length - 1));
      const medio = datos.paso / 2;
      for (const p of datos.puntos) {
        const texto = textoClima(p, h);
        const color =
            capaClima === 'lluvia'
              ? colorPrecipitacion(p.lluvia[h] ?? null, p.nieve[h] ?? null)
              : p.temperatura[h] !== null && p.temperatura[h] !== undefined
                ? colorTemperatura(p.temperatura[h]!)
                : null;
          if (!color) continue;
          L.rectangle(
            [
              [p.lat - medio, p.lng - medio],
              [p.lat + medio, p.lng + medio],
            ],
            { pane: 'clima', color, weight: 0, fillColor: color, fillOpacity: capaClima === 'lluvia' ? 0.5 : 0.35 },
          )
            .bindTooltip(texto)
            .addTo(climaCapa.current);
      }
    });
  }, [clima.data, capaClima, horaClima, fondoViento]);

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
    const hora = (iso: string) => formatearFechaHora(iso, zonaHoraria).slice(-5);
    const fila = (k: string, v: string) => `<tr><td style="color:#64748b;padding:1px 8px 1px 0;vertical-align:top">${k}</td><td style="padding:1px 0">${v}</td></tr>`;
    const filas = [
      fila('Chofer', d?.chofer ? `${escapar(d.chofer)}${d.choferFuente === 'asignado' ? ' <span style="color:#64748b">(asignado)</span>' : ''}` : '—'),
      fila(
        'Velocidad',
        `${c.velocidadKmh === null ? '—' : `<b>${formatearNumero(c.velocidadKmh, 0)} km/h</b>`}${
          d?.estadoMotor ? ` · <span style="color:${COLOR[d.estadoMotor.estado]};font-weight:600">${escapar(d.estadoMotor.texto)}</span>` : ''
        }`,
      ),
      // Migración 182: el clima donde está (si hay una capa de clima prendida)
      ...(() => {
        const p = c.latitud !== null && c.longitud !== null ? climaCercano(climaRef.current, c.latitud, c.longitud) : null;
        return p ? [fila('Clima ahora', escapar(textoClima(p, 0)) + ' <span style="color:#64748b">(Open-Meteo)</span>')] : [];
      })(),
      fila('Última posición', c.ts ? `${escapar(formatearFechaHora(c.ts, zonaHoraria))} <span style="color:#64748b">(${haceTexto(min)})</span>` : '—'),
      fila(
        'Combustible',
        d?.combustible?.litros != null
          ? `<b>≈ ${formatearNumero(d.combustible.litros, 0)} L</b>${d.combustible.pct != null ? ` (${formatearNumero(d.combustible.pct, 0)} %)` : ''}${
              d.combustible.mochilaL ? ` · mochila ${formatearNumero(d.combustible.mochilaL, 0)} L` : ''
            }${d.combustible.aviso ? `<br><span style="color:#b45309">${escapar(d.combustible.aviso)}</span>` : ''}${c.nivelPct !== null ? `<br><span style="color:#64748b">Sensor tanque principal: ${formatearNumero(c.nivelPct, 0)} %</span>` : ''}`
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
      // Migración 107: ralentí y puntaje del día
      fila(
        'Ralentí hoy',
        d?.hoy?.ralenti
          ? `<b style="color:${COLOR_NIVEL[d.hoy.ralenti.nivel ?? ''] ?? 'inherit'}">${formatearNumero(d.hoy.ralenti.pct, 0)} %</b> del tiempo de motor${
              d.hoy.ralenti.horas != null ? ` <span style="color:#64748b">(${formatearNumero(d.hoy.ralenti.horas, 1)} h)</span>` : ''
            }`
          : '<span style="color:#64748b">—</span>',
      ),
      fila(
        'Puntaje del día',
        d?.hoy?.puntaje
          ? `<b style="color:${COLOR_NIVEL[d.hoy.puntaje.nivel ?? ''] ?? 'inherit'}">${formatearNumero(d.hoy.puntaje.total, 0)}</b> de 100`
          : '<span style="color:#64748b">— (todavía sin datos de hoy)</span>',
      ),
      // Migración 103: consumo del mes del chofer
      fila(
        'Consumo del chofer (mes)',
        d?.consumoMes?.l100km != null
          ? `<b>${formatearNumero(d.consumoMes.l100km, 1)} L/100 km</b> <span style="color:#64748b">(${formatearNumero(d.consumoMes.km, 0)} km${
              d.consumoMes.fuente ? `, ${escapar(FUENTE_CONSUMO_MES[d.consumoMes.fuente] ?? d.consumoMes.fuente)}` : ''
            })</span>`
          : `<span style="color:#64748b">— ${d?.choferId ? '(menos de 100 km este mes)' : '(sin chofer)'}</span>`,
      ),
      // Migración 237: consumo del último bloque de 4 h (solo con telemetría del motor)
      ...(d?.consumo4h
        ? [
            fila(
              'Consumo últimas 4 h',
              `${
                d.consumo4h.l100km != null
                  ? `<b>${formatearNumero(d.consumo4h.l100km, 1)} L/100 km</b>`
                  : `<span style="color:#64748b">— (${escapar(d.consumo4h.motivo ?? 'sin dato')})</span>`
              } <span style="color:#64748b">(de ${hora(d.consumo4h.desde)} a ${hora(d.consumo4h.hasta)}, ${formatearNumero(d.consumo4h.km, 0)} km)</span>`,
            ),
          ]
        : []),
      // Migración 100: uso abusivo según la marca
      ...(d?.hoy?.abusivo
        ? [
            fila(
              'Uso abusivo',
              `<b style="color:${d.hoy.abusivo.activo ? COLOR_NIVEL.rojo : COLOR_NIVEL.verde}">${escapar(d.hoy.abusivo.texto)}</b>${
                d.hoy.abusivo.hoy ? '' : ` <span style="color:#64748b">(${escapar(d.hoy.abusivo.fecha.split('-').reverse().join('/'))})</span>`
              }`,
            ),
          ]
        : []),
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
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;padding-right:16px">
                <span style="font-weight:700;font-size:13px">${escapar(c.patente)} <span style="font-weight:400;color:#64748b">${escapar(c.codigoInterno)}</span></span>
                <img src="/irontrack-nombre.png" alt="IronTrack · Gestión de flotas" width="123" height="24" style="display:block;flex-shrink:0;width:123px;height:24px" />
              </div>
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

    // Camiones y celulares cercanos en la pantalla se juntan en un círculo con la cantidad (como Renault).
    // El camión elegido siempre se ve solo. Se recalcula al hacer zoom.
    type Item = { lat: number; lng: number; camion?: CamionEnVivo; celular?: CelularEnMapa };
    const items: Item[] = [
      ...camiones.filter((c) => c.latitud !== null && c.longitud !== null).map((c) => ({ lat: c.latitud!, lng: c.longitud!, camion: c })),
      ...celulares.map((c) => ({ lat: c.latitud, lng: c.longitud, celular: c })),
    ];
    if (!agrupar) {
      dibujarEstelas(L, g, porCamion);
      dibujarDesagrupados(L, m, g, items, porCamion);
      for (const it of items) puntos.push([it.lat, it.lng]);
      if (!encuadrado.current && puntos.length > 0) {
        encuadrado.current = true;
        m.fitBounds(L.latLngBounds(puntos), { padding: [40, 40], maxZoom: 11 });
      }
      return;
    }
    const grupos: { x: number; y: number; items: Item[] }[] = [];
    // Se juntan si están cerca o si sus nombres se pisarían (el nombre va a la derecha del punto)
    const seTocan = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.hypot(a.x - b.x, a.y - b.y) < RADIO_GRUPO || (Math.abs(a.y - b.y) < 18 && Math.abs(a.x - b.x) < 140);
    for (const it of items) {
      puntos.push([it.lat, it.lng]);
      const p = m.latLngToLayerPoint([it.lat, it.lng]);
      const solo = it.camion?.camionId === seleccionado;
      const grupo = solo ? undefined : grupos.find((x) => x.items[0]?.camion?.camionId !== seleccionado && seTocan(x, p));
      if (grupo) grupo.items.push(it);
      else grupos.push({ x: p.x, y: p.y, items: [it] });
    }

    dibujarEstelas(L, g, porCamion);

    for (const grupo of grupos) {
      if (grupo.items.length > 1) {
        dibujarGrupo(L, m, g, grupo.items);
        continue;
      }
      const it = grupo.items[0]!;
      if (it.camion) dibujarCamion(L, m, g, it.camion, porCamion.get(it.camion.camionId));
      else if (it.celular) dibujarCelular(L, g, it.celular);
    }
    if (!encuadrado.current && puntos.length > 0) {
      encuadrado.current = true;
      m.fitBounds(L.latLngBounds(puntos), { padding: [40, 40], maxZoom: 11 });
    }
  }

  /** Estelas: de dónde viene cada camión (más transparente cuanto más vieja). Con un camión elegido, solo la suya. */
  function dibujarEstelas(L: typeof import('leaflet'), g: LayerGroup, porCamion: Map<number, DetalleMapa>) {
    for (const c of camiones) {
      if (c.latitud === null || c.longitud === null) continue;
      const elegido = c.camionId === seleccionado;
      if (seleccionado !== null && !elegido) continue;
      const tramo: [number, number][] = (porCamion.get(c.camionId)?.estela ?? []).map((p) => [p.lat, p.lng]);
      const ultimo = tramo[tramo.length - 1];
      if (!ultimo || ultimo[0] !== c.latitud || ultimo[1] !== c.longitud) tramo.push([c.latitud, c.longitud]);
      for (let i = 1; i < tramo.length; i++) {
        L.polyline([tramo[i - 1]!, tramo[i]!], { color: ESTELA, weight: elegido ? 6 : 4, opacity: 0.25 + (0.75 * i) / (tramo.length - 1), lineCap: 'round' }).addTo(g);
      }
    }
  }

  /**
   * Vista desagrupada: cada camión (y celular) en su lugar con su nombre, sin que se pisen. Los que
   * están en el mismo lugar se abren en ronda con una línea hasta la posición real; los nombres que no
   * entran al lado del punto van un poco más lejos, con una línea guía. Se recalcula con cada zoom.
   */
  function dibujarDesagrupados(
    L: typeof import('leaflet'),
    m: MapaLeaflet,
    g: LayerGroup,
    items: { lat: number; lng: number; camion?: CamionEnVivo; celular?: CelularEnMapa }[],
    porCamion: Map<number, DetalleMapa>,
  ) {
    const cajas = items.map((it, i) => {
      const p = m.latLngToLayerPoint([it.lat, it.lng]);
      const texto = it.camion ? partesCamion(it.camion, porCamion.get(it.camion.camionId)).texto : textoCelular(it.celular!);
      return { id: String(i), x: p.x, y: p.y, w: anchoTexto(texto) + 10, h: 17 };
    });
    const lugares = ubicarEtiquetas(cajas);
    items.forEach((it, i) => {
      const u = lugares[i]!;
      const caja = cajas[i]!;
      const pos = m.layerPointToLatLng([caja.x + u.dx, caja.y + u.dy]);
      const lugar: Lugar = { pos: [pos.lat, pos.lng], lx: u.lx, ly: u.ly, guia: u.guia, w: caja.w, h: caja.h };
      if (u.dx !== 0 || u.dy !== 0) {
        // Dónde está de verdad: un puntito y una línea fina hasta el punto corrido
        L.polyline([[it.lat, it.lng], lugar.pos], { color: '#475569', weight: 1.5, opacity: 0.7, dashArray: '3 3', interactive: false }).addTo(g);
        L.circleMarker([it.lat, it.lng], { radius: 3, color: '#475569', weight: 1, fillColor: '#475569', fillOpacity: 1, interactive: false }).addTo(g);
      }
      if (it.camion) dibujarCamion(L, m, g, it.camion, porCamion.get(it.camion.camionId), lugar);
      else if (it.celular) dibujarCelular(L, g, it.celular, lugar);
    });
  }

  /** Un círculo con la cantidad. Al tocarlo acerca el mapa; si ya no se puede separar, muestra la lista. */
  function dibujarGrupo(L: typeof import('leaflet'), m: MapaLeaflet, g: LayerGroup, grupo: { lat: number; lng: number; camion?: CamionEnVivo; celular?: CelularEnMapa }[]) {
    const lat = grupo.reduce((a, x) => a + x.lat, 0) / grupo.length;
    const lng = grupo.reduce((a, x) => a + x.lng, 0) / grupo.length;
    const n = grupo.length;
    const tam = n < 10 ? 32 : 38;
    const icono = L.divIcon({
      className: '',
      iconSize: [tam, tam],
      iconAnchor: [tam / 2, tam / 2],
      html: `<div title="${n} juntos: tocá para acercar" style="width:${tam}px;height:${tam}px;border-radius:9999px;background:#334155;color:#fff;border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45);display:grid;place-items:center;font:700 14px system-ui;cursor:pointer">${n}</div>`,
    });
    const limites = L.latLngBounds(grupo.map((x) => [x.lat, x.lng] as [number, number]));
    const marcador = L.marker([lat, lng], { icon: icono, zIndexOffset: 500 }).addTo(g);
    marcador.on('click', () => {
      // Si están separados, acerca; si están prácticamente en el mismo lugar (menos de 30 m), la lista
      const juntos = limites.getNorthEast().distanceTo(limites.getSouthWest()) < 30;
      if (!juntos && m.getBoundsZoom(limites.pad(0.5)) > m.getZoom() && m.getZoom() < m.getMaxZoom()) {
        m.fitBounds(limites.pad(0.5), { maxZoom: m.getMaxZoom() });
        return;
      }
      // Están en el mismo lugar: la lista, y tocar uno lo elige
      const lista = document.createElement('div');
      lista.style.cssText = 'font:12px/1.4 system-ui;min-width:200px';
      lista.innerHTML = `<div style="font-weight:700;margin-bottom:4px">${n} en el mismo lugar</div>`;
      for (const x of grupo) {
        const fila = document.createElement(x.camion ? 'button' : 'div');
        fila.style.cssText = 'display:block;width:100%;text-align:left;padding:3px 0;border-top:1px solid #e2e8f0;background:none;cursor:' + (x.camion ? 'pointer' : 'default');
        if (x.camion) {
          const d = detalles.find((y) => y.camionId === x.camion!.camionId);
          fila.innerHTML = `<b style="color:#0f5fa8">${escapar(x.camion.patente)}</b>${d?.chofer ? ` · ${escapar(d.chofer.split(',')[0] ?? d.chofer)}` : ''}`;
          const id = x.camion.camionId;
          fila.addEventListener('click', () => {
            m.closePopup();
            alElegir.current(id);
          });
        } else if (x.celular) {
          fila.innerHTML = `<span style="color:#5b21b6">${escapar(x.celular.chofer)}${x.celular.numeroOperacion ? ` · Op. ${x.celular.numeroOperacion}` : ''} (celular)</span>`;
        }
        lista.appendChild(fila);
      }
      L.popup({ maxWidth: 280, autoPan: false }).setLatLng([lat, lng]).setContent(lista).openOn(m);
    });
  }

  /** El punto (color del motor, rumbo y uso abusivo) y el nombre de un camión. */
  function partesCamion(c: CamionEnVivo, d: DetalleMapa | undefined) {
    const elegido = c.camionId === seleccionado;
    // Migración 112: el color dice el motor; el uso abusivo se marca con «!»
    const color = COLOR[d?.estadoMotor?.estado ?? 'sin_dato'];
    const abusivo = d?.hoy?.abusivo?.activo
      ? `<span title="Uso abusivo" style="position:absolute;left:-9px;top:-10px;width:14px;height:14px;border-radius:9999px;background:${ABUSIVO};color:#fff;font:800 10px/14px system-ui;text-align:center;border:1.5px solid #fff">!</span>`
      : '';
    const anda = (c.velocidadKmh ?? 0) > 2;
    const flecha =
      anda && c.rumbo !== null
        ? `<span style="position:absolute;left:3px;top:-9px;width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:8px solid ${color};transform-origin:5px 17px;transform:rotate(${c.rumbo}deg)"></span>`
        : '';
    const chofer = d?.chofer ? (d.chofer.split(',')[0] ?? d.chofer) : null;
    const velocidad = anda ? ` (${formatearNumero(c.velocidadKmh ?? 0, 0)} km/h)` : '';
    // Migración 103: consumo del mes del chofer
    const consumo = d?.consumoMes?.l100km != null ? `${formatearNumero(d.consumoMes.l100km, 1)} L/100` : null;
    const etiqueta = `${escapar(c.patente)}${chofer ? ` · ${escapar(chofer)}` : ''}${velocidad}${consumo ? ` · <span style="color:#0f5fa8">${consumo}</span>` : ''}`;
    const texto = `${c.patente}${chofer ? ` · ${chofer}` : ''}${velocidad}${consumo ? ` · ${consumo}` : ''}`;
    const punto = `<span style="position:relative;flex:none;display:inline-block;width:16px;height:16px;border-radius:9999px;background:${color};border:2px solid #fff;box-shadow:0 0 0 ${elegido ? 3 : 1}px ${elegido ? '#0f5fa8' : 'rgba(0,0,0,.3)'}">${flecha}${abusivo}</span>`;
    return { elegido, punto, etiqueta, texto };
  }

  function dibujarCamion(L: typeof import('leaflet'), m: MapaLeaflet, g: LayerGroup, c: CamionEnVivo, d: DetalleMapa | undefined, lugar?: Lugar) {
    if (c.latitud === null || c.longitud === null) return;
    const { elegido, punto, etiqueta } = partesCamion(c, d);
    const icono = L.divIcon({
      className: '',
      iconSize: [0, 0],
      html: lugar
        ? htmlEnLugar(punto, 8, etiqueta, ETIQUETA_CAMION, lugar)
        : `<div style="transform:translate(-8px,-8px);display:flex;align-items:center;gap:4px;white-space:nowrap">
               ${punto}
               <span style="${ETIQUETA_CAMION}">${etiqueta}</span>
             </div>`,
    });
    const marcador = L.marker(lugar ? lugar.pos : [c.latitud, c.longitud], { icon: icono, zIndexOffset: elegido ? 1000 : 0 })
      .bindPopup(ficha(c, d), { maxWidth: 320, autoPan: false })
      .on('click', () => alElegir.current(c.camionId))
      .on('popupopen', () => (abierto.current = c.camionId))
      .on('popupclose', () => {
        if (!redibujando.current && abierto.current === c.camionId) abierto.current = null;
      })
      .addTo(g);
    // Centra solo al elegir otro camión (no en cada refresco) y abre su ficha
    if (elegido && centrado.current !== c.camionId) {
      // (se marca antes de mover: el zoom vuelve a dibujar el mapa)
      centrado.current = c.camionId;
      abierto.current = c.camionId;
      m.setView([c.latitud, c.longitud], Math.max(m.getZoom(), 11));
    }
    if (abierto.current === c.camionId) marcador.openPopup();
  }

  function dibujarCelular(L: typeof import('leaflet'), g: LayerGroup, c: CelularEnMapa, lugar?: Lugar) {
    const punto = `<span style="flex:none;display:inline-block;width:14px;height:14px;border-radius:3px;background:${senalDe(minutosDesde(c.ts)) === 'vivo' ? '#7c3aed' : '#a78bfa'};border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.3)"></span>`;
    const etiqueta = escapar(textoCelular(c));
    const icono = L.divIcon({
      className: '',
      iconSize: [0, 0],
      html: lugar
        ? htmlEnLugar(punto, 7, etiqueta, ETIQUETA_CELULAR, lugar)
        : `<div style="transform:translate(-7px,-7px);display:flex;align-items:center;gap:4px;white-space:nowrap">
               ${punto}
               <span style="${ETIQUETA_CELULAR}">${etiqueta}</span>
             </div>`,
    });
    L.marker(lugar ? lugar.pos : [c.latitud, c.longitud], { icon: icono }).addTo(g);
  }

  redibujar.current = dibujar;

  return (
    <>
    <div
      ref={marco}
      className={completa ? 'fixed inset-0 z-[1000] bg-white' : 'relative h-[460px] w-full overflow-hidden rounded-lg border border-borde'}
    >
      <div ref={div} className="h-full w-full" aria-label="Mapa de la flota" />
      {/* Migración 103: ranking de hoy. En pantalla completa flota sobre el mapa; si no, va debajo */}
      {completa && <RankingMapa camiones={camiones} detalles={detalles} onSeleccionar={onSeleccionar} abierto={rankingAbierto} onAlternar={alternarRanking} />}
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
        <button
          type="button"
          onClick={() => setAgrupar((a) => !a)}
          className="inline-flex items-center gap-1 rounded-md bg-white/95 px-2 py-1 text-xs font-medium text-tinta shadow hover:bg-white"
          title={agrupar ? 'Ver cada camión en su lugar, con su nombre' : 'Juntar los camiones cercanos en un círculo con la cantidad'}
        >
          {agrupar ? <Ungroup className="size-4" /> : <Group className="size-4" />}
          {agrupar ? 'Desagrupar' : 'Agrupar'}
        </button>
        {conClima && (
          <label className="flex items-center gap-1 rounded-md bg-white/95 px-2 py-1 text-xs text-tinta shadow">
            <CloudSun className="size-4" />
            <select
              aria-label="Capa de clima"
              className="bg-transparent text-xs font-medium outline-none"
              value={capaClima}
              onChange={(e) => setCapaClima(e.target.value as CapaClima)}
            >
              {CAPAS_CLIMA.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.texto}
                </option>
              ))}
            </select>
          </label>
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
      {conClima && capaClima && (
        <BarraClima
          capa={capaClima}
          horas={clima.data?.horas ?? []}
          hora={horaClima}
          onHora={setHoraClima}
          cargando={clima.isFetching}
          aqui={aqui}
          fondo={fondoViento}
          onFondo={setFondoViento}
          error={clima.data?.error ?? (clima.error instanceof Error ? clima.error.message : null)}
          zonaHoraria={zonaHoraria}
        />
      )}
    </div>
    {!completa && (
      <RankingMapa
        camiones={camiones}
        detalles={detalles}
        onSeleccionar={(id) => {
          // La lista está debajo: subir hasta el mapa para ver el camión elegido
          onSeleccionar(id);
          marco.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }}
        abierto={rankingAbierto}
        onAlternar={alternarRanking}
        debajo
      />
    )}
    </>
  );
}

/** Migración 182: la hora que se mira (ahora a +24 h), las referencias de color y de dónde salen los datos. */
function BarraClima({
  capa,
  horas,
  hora,
  onHora,
  cargando,
  aqui,
  fondo,
  onFondo,
  error,
  zonaHoraria,
}: {
  capa: CapaClima;
  horas: string[];
  hora: number;
  onHora: (h: number) => void;
  cargando: boolean;
  aqui: string | null;
  fondo: boolean;
  onFondo: (v: boolean) => void;
  error: string | null;
  zonaHoraria: string;
}) {
  const max = Math.max(0, horas.length - 1);
  const actual = horas[Math.min(hora, max)];
  const referencias: [string, string][] =
    capa === 'viento'
      ? []
      : capa === 'lluvia'
        ? [['#93c5fd', '< 1 mm'], ['#3b82f6', '1–4'], ['#1d4ed8', '4–10'], ['#1e3a8a', '10 o más'], ['#c084fc', 'nieve'], ['#7c3aed', 'nieve 1 cm o más']]
        : [['#6366f1', 'helada (0 °C o menos)'], ['#60a5fa', '0–10 °C'], ['#34d399', '10–20'], ['#fbbf24', '20–30'], ['#ef4444', '30 o más']];
  return (
    <div className="absolute right-3 bottom-6 left-3 z-[1000] space-y-1 rounded-md bg-white/95 px-3 py-2 text-xs text-tinta shadow sm:right-auto sm:w-[30rem]">
      <div className="flex items-center gap-2">
        <span className="w-28 shrink-0 font-medium">
          {hora === 0 ? 'Ahora' : `+${hora} h`}
          {actual && ` · ${formatearFechaHora(actual, zonaHoraria).slice(-5)}`}
        </span>
        <input
          type="range"
          min={0}
          max={max}
          value={Math.min(hora, max)}
          onChange={(e) => onHora(Number(e.target.value))}
          className="flex-1 accent-marca"
          aria-label="Hora del clima"
        />
        {cargando && <span className="text-tinta-suave">Cargando…</span>}
      </div>
      {capa === 'viento' && fondo && (
        <div>
          <div
            className="h-2.5 rounded-sm"
            style={{ background: `linear-gradient(to right, ${ESCALA_VIENTO.map(([k, c]) => `rgb(${c.join(',')}) ${(k / 80) * 100}%`).join(', ')})` }}
          />
          <div className="relative h-3.5 text-[10px] text-tinta-suave">
            {ESCALA_VIENTO.map(([k]) => (
              <span key={k} className="absolute -translate-x-1/2" style={{ left: `${(k / 80) * 100}%` }}>
                {k}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {capa === 'viento' && <span>Viento en km/h · los trazos muestran hacia dónde sopla</span>}
        {capa === 'viento' && (
          <label className="inline-flex items-center gap-1">
            <input type="checkbox" className="accent-marca" checked={fondo} onChange={(e) => onFondo(e.target.checked)} /> Fondo con la escala
          </label>
        )}
        {referencias.map(([color, texto]) => (
          <span key={texto} className="inline-flex items-center gap-1">
            <span className="inline-block size-3 rounded-sm" style={{ background: color }} /> {texto}
          </span>
        ))}
        <span className="ml-auto text-tinta-suave">Datos: Open-Meteo</span>
      </div>
      <p className="min-h-4 text-tinta-suave">{aqui ? `Acá: ${aqui}` : 'Pasá el mouse por el mapa para ver el clima de ese lugar.'}</p>
      {error && <p className="text-error">{error}</p>}
    </div>
  );
}
