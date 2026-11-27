'use client';

import { Sparkles } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { porcentajeBarra, type AnalisisTope } from '../domain/tope-fondo';

/**
 * Migración 386 · «Análisis de Iris»: lo que el chofer lleva generado de sueldo en mano este período contra lo que
 * tiene sin rendir, sus pedidos sin cobrar y lo que pide. La base hace la cuenta y frena; acá solo se muestra.
 */
const clp = (v: number) => `${Math.round(v).toLocaleString('es-AR')} CLP`;

const COLOR: Record<AnalisisTope['estado'], { caja: string; barra: string }> = {
  ok: { caja: 'border-borde bg-panel', barra: 'bg-exito' },
  cerca: { caja: 'border-alerta/40 bg-alerta/10', barra: 'bg-alerta' },
  pasado: { caja: 'border-error/40 bg-error/10', barra: 'bg-error' },
  sin_datos: { caja: 'border-borde bg-panel', barra: 'bg-borde' },
};

export function AnalisisTopeFondo({ a, para, compacto = false }: { a: AnalisisTope; para: 'chofer' | 'oficina'; compacto?: boolean }) {
  const texto = para === 'chofer' ? (a.textoChofer ?? a.texto) : a.texto;
  if (a.estado === 'sin_datos') {
    return para === 'oficina' ? <p className="text-xs text-tinta-suave">Iris: {a.texto}</p> : null;
  }
  const pct = porcentajeBarra(a);
  const c = COLOR[a.estado];
  return (
    <div className={cn('space-y-2 rounded-md border p-3 text-sm text-tinta', c.caja)}>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
        <Sparkles className="size-4 text-marca" /> Análisis de Iris
        {para === 'oficina' && a.pedidoPor === 'oficina' && a.estado === 'pasado' && (
          <span className="rounded bg-error/15 px-1.5 py-0.5 text-xs font-semibold text-error">Pedido por Operaciones pasado del límite</span>
        )}
      </p>
      <p>{texto}</p>
      <div className="space-y-1">
        <div
          className="relative h-2 overflow-hidden rounded-full bg-borde/60"
          role="meter"
          aria-label="Parte de lo generado en mano ya comprometida"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <div className={cn('h-full rounded-full', c.barra)} style={{ width: `${pct}%` }} />
          <div className="absolute inset-y-0 w-px bg-tinta/40" style={{ left: `${a.avisoPct}%` }} title={`Aviso al ${a.avisoPct} %`} />
        </div>
        <p className="text-xs text-tinta-suave tabular-nums">
          {a.usadoPct ?? pct} % de lo generado en mano{a.usadoPct !== null && a.usadoPct > 100 ? ' (pasado)' : ''} · aviso al {a.avisoPct} %
        </p>
      </div>
      {!compacto && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
          <Dato t="Generado en mano" v={clp(a.enMano)} nota={`de ${clp(a.generado)}, menos ${a.descuentoPct} %`} />
          <Dato t="Sin rendir" v={clp(a.sinRendirClp)} />
          <Dato t={para === 'chofer' ? 'Pedidos sin cobrar' : 'Otros pedidos abiertos'} v={clp(a.pedidosAbiertosClp)} />
          {a.pideClp > 0 ? <Dato t="Este pedido" v={clp(a.pideClp)} /> : <Dato t="Puede pedir hasta" v={clp(a.puedePedirHastaClp)} />}
        </dl>
      )}
      {a.monedasSinCambio.length > 0 && (
        <p className="text-xs text-tinta-suave">Sin tipo de cambio de hoy para {a.monedasSinCambio.join(', ')}: esa plata no entra en la cuenta.</p>
      )}
      {!compacto && a.diasPasados > 0 && a.dias > 0 && a.diasPasados <= 7 && (
        <p className="text-xs text-tinta-suave">
          Van {a.diasPasados} de {a.dias} días del período: lo generado todavía es poco y crece con los días y los tramos que se cierran.
        </p>
      )}
    </div>
  );
}

function Dato({ t, v, nota }: { t: string; v: string; nota?: string }) {
  return (
    <div>
      <dt className="text-tinta-suave">{t}</dt>
      <dd className="font-semibold tabular-nums">{v}</dd>
      {nota && <dd className="text-tinta-suave">{nota}</dd>}
    </div>
  );
}
