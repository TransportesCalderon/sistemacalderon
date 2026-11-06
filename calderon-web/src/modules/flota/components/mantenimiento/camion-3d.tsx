'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import {
  caras,
  dentro,
  encuadre,
  estiloCabina,
  modeloSemi,
  modeloTractor,
  piezaMarcada,
  rotar,
  zonasEnModelo,
  type Vec3,
} from '../../domain/camion3d';
import type { Equipo } from '../../domain/vencimientos.types';

const AMARILLO = '#f5c518';
const BORDE_AMARILLO = '#9a6b00';
const VISTAS = {
  tres: { giro: -0.65, inclinacion: 0.32, etiqueta: '3/4' },
  lado: { giro: 0, inclinacion: 0.05, etiqueta: 'Lado' },
  frente: { giro: -Math.PI / 2, inclinacion: 0.1, etiqueta: 'Frente' },
  arriba: { giro: -0.3, inclinacion: 1.35, etiqueta: 'Arriba' },
  abajo: { giro: -0.4, inclinacion: -0.9, etiqueta: 'Abajo' },
} as const;
type Vista = keyof typeof VISTAS;

function tono(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}

/**
 * Mantenimiento (M4) · Tractor o semi en 3D (se gira arrastrando) con las zonas de la orden en amarillo.
 * Con «onTocar», tocar una parte la marca o la desmarca (al pedir una orden). Modelo genérico: la forma
 * de la cabina sale de la ficha; la marca se muestra como texto.
 */
export function Camion3D({
  equipo,
  marca,
  modelo,
  tipoSemi,
  zonas,
  nombres,
  onTocar,
  alto = 280,
}: {
  equipo: Equipo;
  marca?: string | null;
  modelo?: string | null;
  tipoSemi?: string | null;
  zonas: readonly string[];
  nombres: Record<string, string>;
  onTocar?: (zona: string) => void;
  alto?: number;
}) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const [vista, setVista] = useState<{ giro: number; inclinacion: number }>({ giro: VISTAS.tres.giro, inclinacion: VISTAS.tres.inclinacion });
  const [ancho, setAncho] = useState(600);
  const [sobre, setSobre] = useState<string | null>(null);
  const arrastre = useRef<{ x: number; y: number; giro: number; inclinacion: number; movio: boolean } | null>(null);
  const dibujadas = useRef<{ zonas: readonly string[]; poli: [number, number][] }[]>([]);

  const estilo = useMemo(() => estiloCabina(marca ?? null, modelo ?? null), [marca, modelo]);
  const piezas = useMemo(() => (equipo === 'tractor' ? modeloTractor(estilo) : modeloSemi(tipoSemi ?? null)), [equipo, estilo, tipoSemi]);
  const todas = useMemo(() => caras(piezas), [piezas]);
  const marco = useMemo(() => encuadre(piezas), [piezas]);
  const marcadas = zonasEnModelo(piezas, zonas);

  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAncho(Math.max(240, Math.round(e?.contentRect.width ?? 600))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const cv = lienzo.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = ancho * dpr;
    cv.height = alto * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, ancho, alto);

    const { centro, radio } = marco;
    const dist = radio * 5;
    const luz: Vec3 = [0.35, 0.8, 0.5];
    const crudo = (p: Vec3) => {
      const r = rotar([p[0] - centro[0], p[1] - centro[1], p[2] - centro[2]], vista.giro, vista.inclinacion);
      const f = dist / (dist - r[2]);
      return { u: r[0] * f, v: -r[1] * f, r };
    };
    // Encuadre: que todo el equipo entre en el lienzo, con margen, en cualquier vista
    const us = todas.flatMap((c) => c.puntos.map(crudo));
    const [u0, u1] = [Math.min(...us.map((q) => q.u)), Math.max(...us.map((q) => q.u))];
    const [v0, v1] = [Math.min(...us.map((q) => q.v)), Math.max(...us.map((q) => q.v))];
    const escala = Math.min((ancho - 24) / (u1 - u0 || 1), (alto - 44) / (v1 - v0 || 1));
    const ox = ancho / 2 - ((u0 + u1) / 2) * escala;
    const oy = alto / 2 + 8 - ((v0 + v1) / 2) * escala;
    const proy = (p: Vec3) => {
      const q = crudo(p);
      return { x: ox + q.u * escala, y: oy + q.v * escala, z: q.r[2], r: q.r };
    };

    // Sombra en el piso
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.beginPath();
    const piso = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => proy([centro[0] + sx * radio * 0.95, 0, centro[2] + sz * 1.4])));
    [piso[0]!, piso[1]!, piso[3]!, piso[2]!].forEach((q, k) => (k ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    ctx.closePath();
    ctx.fill();

    const lista = todas
      .map((c) => {
        const pts = c.puntos.map(proy);
        const p = piezas[c.pieza]!;
        // Normal hacia afuera de la pieza (en el espacio de la cámara) para descartar las caras de atrás
        const [a, b, d] = [pts[0]!.r, pts[1]!.r, pts[2]!.r];
        let n: Vec3 = [
          (b[1] - a[1]) * (d[2] - a[2]) - (b[2] - a[2]) * (d[1] - a[1]),
          (b[2] - a[2]) * (d[0] - a[0]) - (b[0] - a[0]) * (d[2] - a[2]),
          (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]),
        ];
        const m = pts.reduce<[number, number, number]>((s, q) => [s[0] + q.r[0] / pts.length, s[1] + q.r[1] / pts.length, s[2] + q.r[2] / pts.length], [0, 0, 0]);
        const pc = rotar([p.centro[0] - centro[0], p.centro[1] - centro[1], p.centro[2] - centro[2]], vista.giro, vista.inclinacion);
        if (n[0] * (m[0] - pc[0]) + n[1] * (m[1] - pc[1]) + n[2] * (m[2] - pc[2]) < 0) n = [-n[0], -n[1], -n[2]];
        const largo = Math.hypot(...n) || 1;
        n = [n[0] / largo, n[1] / largo, n[2] / largo];
        return { c, pts, p, n, z: m[2] };
      })
      .filter((x) => x.n[2] > -0.02)
      .sort((x, y) => x.z - y.z);

    const ll = Math.hypot(...luz);
    const out: typeof dibujadas.current = [];
    for (const { pts, p, n } of lista) {
      const marcada = piezaMarcada(p, zonas);
      const brillo = 0.58 + 0.42 * Math.max(0, (n[0] * luz[0] + n[1] * luz[1] + n[2] * luz[2]) / ll);
      const resaltada = sobre !== null && p.zonas[0] === sobre;
      ctx.beginPath();
      pts.forEach((q, k) => (k ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.closePath();
      ctx.fillStyle = tono(marcada ? AMARILLO : p.color, brillo * (resaltada ? 1.12 : 1));
      ctx.fill();
      ctx.lineWidth = marcada ? 1.2 : 0.5;
      ctx.strokeStyle = marcada ? BORDE_AMARILLO : 'rgba(0,0,0,0.25)';
      ctx.stroke();
      out.push({ zonas: p.zonas, poli: pts.map((q) => [q.x, q.y]) });
    }
    dibujadas.current = out;
  }, [todas, piezas, marco, vista, ancho, alto, zonas, sobre]);

  const zonaEn = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    for (let i = dibujadas.current.length - 1; i >= 0; i--) {
      const d = dibujadas.current[i]!;
      if (dentro(x, y, d.poli)) return d.zonas[0] ?? null;
    }
    return null;
  };

  return (
    <div className="space-y-2">
      <div ref={caja} className="relative overflow-hidden rounded-lg border border-borde bg-gradient-to-b from-[#f4f7fb] to-[#e6ebf2]">
        <canvas
          ref={lienzo}
          style={{ width: ancho, height: alto, touchAction: 'none' }}
          className={cn('block', onTocar ? 'cursor-pointer' : 'cursor-grab')}
          role="img"
          aria-label={`${equipo === 'tractor' ? 'Tractor' : 'Semi'} en 3D${marcadas.length ? `, a revisar: ${marcadas.map((z) => nombres[z] ?? z).join(', ')}` : ''}`}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            arrastre.current = { x: e.clientX, y: e.clientY, giro: vista.giro, inclinacion: vista.inclinacion, movio: false };
          }}
          onPointerMove={(e) => {
            const a = arrastre.current;
            if (!a) return setSobre(zonaEn(e));
            const dx = e.clientX - a.x;
            const dy = e.clientY - a.y;
            if (Math.abs(dx) + Math.abs(dy) > 4) a.movio = true;
            setVista({ giro: a.giro + dx * 0.01, inclinacion: Math.max(-1.45, Math.min(1.45, a.inclinacion + dy * 0.01)) });
          }}
          onPointerUp={(e) => {
            const a = arrastre.current;
            arrastre.current = null;
            if (a && !a.movio && onTocar) {
              const z = zonaEn(e);
              if (z) onTocar(z);
            }
          }}
          onPointerLeave={() => setSobre(null)}
        />
        <div className="pointer-events-none absolute left-3 top-2 text-xs text-tinta-suave">
          {equipo === 'tractor' ? `${estilo.descripcion} · 3 ejes` : `Semi${tipoSemi ? ` ${tipoSemi}` : ''} · 3 ejes`} (modelo genérico)
        </div>
        {sobre && (
          <div className="pointer-events-none absolute right-3 top-2 rounded bg-panel/90 px-2 py-0.5 text-xs text-tinta shadow">
            {nombres[sobre] ?? sobre}
            {onTocar && ' · tocá para marcar'}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {(Object.keys(VISTAS) as Vista[]).map((k) => (
          <button
            key={k}
            type="button"
            className="rounded-full border border-borde px-2.5 py-0.5 text-tinta-suave hover:bg-hover"
            onClick={() => setVista({ giro: VISTAS[k].giro, inclinacion: VISTAS[k].inclinacion })}
          >
            {k === 'tres' && <RotateCcw className="mr-1 inline size-3" />}
            {VISTAS[k].etiqueta}
          </button>
        ))}
        <span className="text-tinta-suave">· Arrastrá para girarlo{onTocar ? '; tocá una parte para marcarla' : ''}.</span>
      </div>
      {marcadas.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-tinta-suave">En amarillo:</span>
          {marcadas.map((z) => (
            <span key={z} className="rounded-full border border-[#d4a106] bg-[#fff4c2] px-2.5 py-0.5 text-[#6b5000]">
              {nombres[z] ?? z}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
