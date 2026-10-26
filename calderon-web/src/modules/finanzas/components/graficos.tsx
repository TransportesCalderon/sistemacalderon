'use client';

import { useState } from 'react';
import { cn } from '@/shared/lib/cn';
import { dinero, dineroCorto, mesCorto, mesEje } from '../domain/finanzas.types';

/**
 * Gráficos del tablero (SVG propio, sin librerías). Colores validados para daltonismo
 * (paleta de referencia: azul #2a78d6, naranja #eb6834, rojo #e34948 sobre blanco).
 * Cada barra tiene su ayuda al pasar el mouse; los textos van en tinta, no en el color de la serie.
 */
const AZUL = '#2a78d6';
const NARANJA = '#eb6834';
const ROJO = '#e34948';

/** Escala «linda» para el eje: 0 y 3 o 4 marcas redondas. */
function escala(min: number, max: number) {
  const lo = Math.min(0, min);
  const hi = Math.max(0, max);
  const rango = hi - lo || 1;
  const paso0 = rango / 4;
  const mag = 10 ** Math.floor(Math.log10(paso0));
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((p) => p >= paso0) ?? paso0;
  const desde = Math.floor(lo / paso) * paso;
  const hasta = Math.ceil(hi / paso) * paso;
  const marcas: number[] = [];
  for (let v = desde; v <= hasta + paso / 2; v += paso) marcas.push(Math.round(v));
  return { desde, hasta, marcas };
}

/** Barra con la punta redondeada (4px) y la base pegada al cero. */
function barra(x: number, y0: number, y1: number, ancho: number) {
  const r = Math.min(4, ancho / 2, Math.abs(y1 - y0));
  if (Math.abs(y1 - y0) < 0.5) return '';
  if (y1 < y0) {
    return `M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + ancho - r} Q${x + ancho},${y1} ${x + ancho},${y1 + r} V${y0} Z`;
  }
  return `M${x},${y0} V${y1 - r} Q${x},${y1} ${x + r},${y1} H${x + ancho - r} Q${x + ancho},${y1} ${x + ancho},${y1 - r} V${y0} Z`;
}

const AN = 560;
const AL = 230;
const M = { izq: 62, der: 8, arr: 12, aba: 28 };

function Ayuda({ x, children }: { x: number; children: React.ReactNode }) {
  const izq = `${(x / AN) * 100}%`;
  return (
    <div
      role="status"
      className="pointer-events-none absolute top-2 z-10 min-w-56 -translate-x-1/2 whitespace-nowrap rounded-md border border-borde bg-panel px-3 py-2 text-xs shadow-md"
      style={{ left: izq }}
    >
      {children}
    </div>
  );
}

function Leyenda({ items }: { items: { color: string; texto: string }[] }) {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-tinta-suave">
      {items.map((i) => (
        <span key={i.texto} className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: i.color }} aria-hidden />
          {i.texto}
        </span>
      ))}
    </div>
  );
}

/** Ingresos contra costos y gastos, mes a mes (barras agrupadas). */
export function GraficoIngresosGastos({ meses, ingresos, egresos }: { meses: string[]; ingresos: number[]; egresos: number[] }) {
  const [foco, setFoco] = useState<number | null>(null);
  const { desde, hasta, marcas } = escala(0, Math.max(...ingresos, ...egresos, 1));
  const y = (v: number) => M.arr + ((hasta - v) / (hasta - desde)) * (AL - M.arr - M.aba);
  const paso = (AN - M.izq - M.der) / Math.max(meses.length, 1);
  const ancho = Math.max(4, Math.min(16, (paso - 8) / 2));
  return (
    <div className="space-y-2">
      <Leyenda items={[{ color: AZUL, texto: 'Ingresos' }, { color: NARANJA, texto: 'Costos y gastos' }]} />
      <div className="relative" onMouseLeave={() => setFoco(null)}>
        <svg viewBox={`0 0 ${AN} ${AL}`} className="h-auto w-full" role="img" aria-label="Ingresos y costos más gastos por mes">
          {marcas.map((m) => (
            <g key={m}>
              <line x1={M.izq} x2={AN - M.der} y1={y(m)} y2={y(m)} stroke="currentColor" className="text-borde" strokeWidth={m === 0 ? 1.2 : 0.6} />
              <text x={M.izq - 8} y={y(m) + 4} textAnchor="end" className="fill-tinta-suave text-[13px]">
                {dineroCorto(m)}
              </text>
            </g>
          ))}
          {meses.map((mes, i) => {
            const x0 = M.izq + i * paso + paso / 2 - ancho - 1;
            return (
              <g key={mes}>
                {foco === i && <rect x={M.izq + i * paso + 2} y={M.arr} width={paso - 4} height={AL - M.arr - M.aba} className="fill-hover" />}
                <path d={barra(x0, y(0), y(ingresos[i] ?? 0), ancho)} fill={AZUL} />
                <path d={barra(x0 + ancho + 2, y(0), y(egresos[i] ?? 0), ancho)} fill={NARANJA} />
                <text x={M.izq + i * paso + paso / 2} y={AL - 8} textAnchor="middle" className="fill-tinta-suave text-[13px]">
                  {mesEje(mes, i)}
                </text>
                <rect
                  x={M.izq + i * paso}
                  y={0}
                  width={paso}
                  height={AL}
                  fill="transparent"
                  onMouseEnter={() => setFoco(i)}
                  onFocus={() => setFoco(i)}
                  tabIndex={0}
                  aria-label={`${mesCorto(mes)}: ingresos ${dinero(ingresos[i] ?? 0)}, costos y gastos ${dinero(egresos[i] ?? 0)}`}
                />
              </g>
            );
          })}
        </svg>
        {foco !== null && (
          <Ayuda x={M.izq + foco * paso + paso / 2}>
            <p className="mb-1 font-medium text-tinta">{mesCorto(meses[foco]!)}</p>
            <Renglon color={AZUL} texto="Ingresos" valor={dinero(ingresos[foco] ?? 0)} />
            <Renglon color={NARANJA} texto="Costos y gastos" valor={dinero(egresos[foco] ?? 0)} />
            <p className="mt-1 border-t border-borde pt-1 text-tinta">
              Resultado: <span className="font-medium tabular-nums">{dinero((ingresos[foco] ?? 0) - (egresos[foco] ?? 0))}</span>
            </p>
          </Ayuda>
        )}
      </div>
    </div>
  );
}

function Renglon({ color, texto, valor }: { color: string; texto: string; valor: string }) {
  return (
    <p className="flex items-center justify-between gap-3 text-tinta-suave">
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block size-2 rounded-sm" style={{ background: color }} aria-hidden />
        {texto}
      </span>
      <span className="font-medium text-tinta tabular-nums">{valor}</span>
    </p>
  );
}

/** Resultado de cada mes: azul si ganó, rojo si perdió (con su leyenda: no depende solo del color). */
export function GraficoResultado({ meses, resultado }: { meses: string[]; resultado: number[] }) {
  const [foco, setFoco] = useState<number | null>(null);
  const { desde, hasta, marcas } = escala(Math.min(...resultado, 0), Math.max(...resultado, 1));
  const y = (v: number) => M.arr + ((hasta - v) / (hasta - desde)) * (AL - M.arr - M.aba);
  const paso = (AN - M.izq - M.der) / Math.max(meses.length, 1);
  const ancho = Math.max(6, Math.min(26, paso - 12));
  const ultimo = resultado.length - 1;
  return (
    <div className="space-y-2">
      <Leyenda items={[{ color: AZUL, texto: 'Ganancia' }, { color: ROJO, texto: 'Pérdida' }]} />
      <div className="relative" onMouseLeave={() => setFoco(null)}>
        <svg viewBox={`0 0 ${AN} ${AL}`} className="h-auto w-full" role="img" aria-label="Resultado de cada mes">
          {marcas.map((m) => (
            <g key={m}>
              <line x1={M.izq} x2={AN - M.der} y1={y(m)} y2={y(m)} stroke="currentColor" className="text-borde" strokeWidth={m === 0 ? 1.2 : 0.6} />
              <text x={M.izq - 8} y={y(m) + 4} textAnchor="end" className="fill-tinta-suave text-[13px]">
                {dineroCorto(m)}
              </text>
            </g>
          ))}
          {meses.map((mes, i) => {
            const v = resultado[i] ?? 0;
            const x0 = M.izq + i * paso + (paso - ancho) / 2;
            return (
              <g key={mes}>
                {foco === i && <rect x={M.izq + i * paso + 2} y={M.arr} width={paso - 4} height={AL - M.arr - M.aba} className="fill-hover" />}
                <path d={barra(x0, y(0), y(v), ancho)} fill={v >= 0 ? AZUL : ROJO} />
                {i === ultimo && v !== 0 && (
                  <text x={x0 + ancho / 2} y={v >= 0 ? y(v) - 6 : y(v) + 14} textAnchor="middle" className="fill-tinta text-[13px] font-medium">
                    {dineroCorto(v)}
                  </text>
                )}
                <text x={M.izq + i * paso + paso / 2} y={AL - 8} textAnchor="middle" className="fill-tinta-suave text-[13px]">
                  {mesEje(mes, i)}
                </text>
                <rect
                  x={M.izq + i * paso}
                  y={0}
                  width={paso}
                  height={AL}
                  fill="transparent"
                  onMouseEnter={() => setFoco(i)}
                  onFocus={() => setFoco(i)}
                  tabIndex={0}
                  aria-label={`${mesCorto(mes)}: resultado ${dinero(v)}`}
                />
              </g>
            );
          })}
        </svg>
        {foco !== null && (
          <Ayuda x={M.izq + foco * paso + paso / 2}>
            <p className="font-medium text-tinta">{mesCorto(meses[foco]!)}</p>
            <p className="text-tinta-suave">
              {(resultado[foco] ?? 0) >= 0 ? 'Ganancia' : 'Pérdida'}: <span className="font-medium text-tinta tabular-nums">{dinero(resultado[foco] ?? 0)}</span>
            </p>
          </Ayuda>
        )}
      </div>
    </div>
  );
}

/** En qué se fue la plata este mes (barras horizontales, una sola serie con su valor). */
export function GraficoPrincipales({ items }: { items: { nombre: string; valor: number }[] }) {
  const max = Math.max(...items.map((i) => i.valor), 1);
  return (
    <ul className="space-y-2.5">
      {items.map((i) => (
        <li key={i.nombre} className="group">
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-tinta">{i.nombre}</span>
            <span className="font-medium text-tinta tabular-nums">{dinero(i.valor)}</span>
          </div>
          <div className="h-2.5 rounded-full bg-hover">
            <div className={cn('h-2.5 rounded-full transition-opacity group-hover:opacity-80')} style={{ width: `${(i.valor / max) * 100}%`, background: AZUL }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
