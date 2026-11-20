'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, ClipboardCheck } from 'lucide-react';
import { Cargando, Chip, ErrorLectura, Vacio, type Tono } from '@/modules/combustible/components/comun/ui';
import { browserDb } from '@/shared/supabase/browser';
import { formatearNumero } from '@/shared/lib/numeros';
import { cn } from '@/shared/lib/cn';
import { CONTROL_FILTRO, TARJETA } from '@/shared/ui/clases';
import { parsearFicha, type Color, type FichaChofer, type FilaOficina } from '../domain/ficha-cumplimiento';

const TONO: Record<Color, Tono> = { verde: 'exito', amarillo: 'alerta', rojo: 'error' };
const ETIQUETA: Record<Color, string> = { verde: 'Bien', amarillo: 'A mirar', rojo: 'Revisar' };
const n0 = (v: number | null) => (v === null ? '—' : formatearNumero(v, 0));

function Semaforo({ c }: { c: Color | null }) {
  return c ? <Chip tono={TONO[c]}>{ETIQUETA[c]}</Chip> : null;
}

/**
 * Iris 15 y 16 · Ficha de cumplimiento por persona, por mes. Solo Gerencia, TI y el auditor (lo controla la base).
 * Lo principal del chofer es la plata del fondo fijo: cuánta recibió y cuánta rindió.
 */
export function FichaCumplimiento() {
  const [abierto, setAbierto] = useState(false);
  const [mes, setMes] = useState('');
  const [buscar, setBuscar] = useState('');
  const q = useQuery({
    queryKey: ['anomalias', 'ficha-cumplimiento', mes, buscar.trim()] as const,
    enabled: abierto,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await browserDb()
        .schema('ana')
        .rpc('fn_ficha_cumplimiento', { p_mes: mes ? `${mes}-01` : null, p_chofer: buscar.trim() || null });
      if (error) throw error;
      return parsearFicha(data);
    },
  });

  return (
    <section className={cn(TARJETA, 'p-4')}>
      <button type="button" className="flex w-full items-center justify-between gap-2 text-left" onClick={() => setAbierto(!abierto)} aria-expanded={abierto}>
        <span className="flex items-center gap-2 font-medium text-tinta">
          <ClipboardCheck className="size-4" /> Ficha de cumplimiento por persona
        </span>
        {abierto ? <ChevronUp className="size-5 text-tinta-suave" /> : <ChevronDown className="size-5 text-tinta-suave" />}
      </button>
      {abierto && (
        <div className="mt-3 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1 text-sm">
              <span className="block text-xs text-tinta-suave">Mes</span>
              <input type="month" className={CONTROL_FILTRO} value={mes} onChange={(e) => setMes(e.target.value)} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="block text-xs text-tinta-suave">Chofer (apellido o legajo)</span>
              <input className={CONTROL_FILTRO} maxLength={60} value={buscar} onChange={(e) => setBuscar(e.target.value)} />
            </label>
          </div>
          {q.isPending ? (
            <Cargando texto="Armando la ficha…" />
          ) : q.isError ? (
            <ErrorLectura texto={q.error.message} onReintentar={() => void q.refetch()} />
          ) : (
            <>
              <p className="text-sm text-tinta-suave">{q.data.comoLeerlo}</p>
              {q.data.noSePudoLeer.length > 0 && <p className="text-sm text-alerta">No se pudo leer: {q.data.noSePudoLeer.join(' · ')}</p>}
              <h3 className="text-sm font-semibold text-tinta">Choferes · {q.data.mes}</h3>
              {q.data.choferes.length === 0 ? (
                <Vacio icono={<ClipboardCheck className="size-6" />} texto="No hay datos de choferes en ese mes." />
              ) : (
                <ul className="space-y-3">
                  {q.data.choferes.map((c, i) => (
                    <FilaChofer key={`${c.chofer}-${i}`} c={c} />
                  ))}
                </ul>
              )}
              <h3 className="text-sm font-semibold text-tinta">Oficina</h3>
              <div className="grid gap-3 md:grid-cols-3">
                <ListaOficina titulo="Revisó gastos de choferes" filas={q.data.gastosRevisados} unidad="días" />
                <ListaOficina titulo="Aprobó cierres de viaje" filas={q.data.cierresAprobados} unidad="días desde la llegada" />
                <ListaOficina titulo="Resolvió pedidos de dinero" filas={q.data.pedidosResueltos} unidad="horas" />
              </div>
              <p className="text-xs text-tinta-suave">{q.data.colores}</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function FilaChofer({ c }: { c: FichaChofer }) {
  const datos: { etiqueta: string; valor: string; color?: Color | null }[] = [
    { etiqueta: 'Viajes cerrados', valor: n0(c.viajes) },
    {
      etiqueta: 'Combustible a su cargo',
      valor: c.combustibleL === null ? '—' : `${n0(c.combustibleL)} L${c.combustibleClp ? ` · CLP ${n0(c.combustibleClp)}` : ''}`,
    },
    { etiqueta: 'Puntaje de manejo', valor: c.puntaje === null ? '—' : formatearNumero(c.puntaje, 1) },
    { etiqueta: 'Ralentí de más', valor: c.ralentiL === null ? '—' : `${n0(c.ralentiL)} L`, color: c.ralentiColor },
    { etiqueta: 'Cargas sin ticket', valor: n0(c.cargasSinTicket), color: c.ticketsColor },
    { etiqueta: 'Noches fuera de horario', valor: n0(c.nochesFueraHorario), color: c.horarioColor },
    {
      etiqueta: 'Gastos',
      valor:
        c.gastosSubidos === null
          ? '—'
          : `${n0(c.gastosSubidos)} subidos${c.gastosRechazados ? ` · ${n0(c.gastosRechazados)} rechazados` : ''}${c.diasGasto !== null ? ` · tarda ${formatearNumero(c.diasGasto, 1)} días` : ''}`,
    },
  ].filter((d) => d.valor !== '—' && d.valor !== '0');

  return (
    <li className={cn('space-y-2 rounded-md border border-borde p-3', c.enRojo > 0 && 'border-l-4 border-l-error')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-tinta">{c.chofer}</span>
        <span className="flex gap-2 text-xs">
          {c.enRojo > 0 && <Chip tono="error">{c.enRojo} para revisar</Chip>}
          {c.enAmarillo > 0 && <Chip tono="alerta">{c.enAmarillo} a mirar</Chip>}
          {c.enRojo === 0 && c.enAmarillo === 0 && <Chip tono="exito">Al día</Chip>}
        </span>
      </div>
      {c.fondo.length > 0 && (
        <div className="flex flex-wrap items-start gap-3 text-sm">
          <span className="text-tinta-suave">Fondo fijo:</span>
          {c.fondo.map((f) => (
            <span key={f.moneda} className="tabular-nums text-tinta">
              {f.moneda} recibió {n0(f.entregadoMes)} en el mes · sin rendir <strong>{n0(f.sinRendir)}</strong>
              {f.pctRendido !== null && ` · rindió ${n0(f.pctRendido)} %`}
            </span>
          ))}
          <Semaforo c={c.fondoColor} />
        </div>
      )}
      {datos.length > 0 && (
        <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {datos.map((d) => (
            <div key={d.etiqueta} className="flex flex-wrap items-center gap-2">
              <dt className="text-tinta-suave">{d.etiqueta}:</dt>
              <dd className="tabular-nums text-tinta">{d.valor}</dd>
              <Semaforo c={d.color ?? null} />
            </div>
          ))}
        </dl>
      )}
      {c.atrasos.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-error">
          {c.atrasos.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

function ListaOficina({ titulo, filas, unidad }: { titulo: string; filas: FilaOficina[]; unidad: string }) {
  return (
    <div className="rounded-md border border-borde p-3 text-sm">
      <p className="mb-1 font-medium text-tinta">{titulo}</p>
      {filas.length === 0 ? (
        <p className="text-tinta-suave">Nadie en ese mes.</p>
      ) : (
        <ul className="space-y-1">
          {filas.map((f, i) => (
            <li key={`${f.quien}-${i}`} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-tinta">
                {f.quien} · {n0(f.cantidad)}
              </span>
              <span className="flex items-center gap-2 tabular-nums text-tinta-suave">
                {f.demora !== null && `${formatearNumero(f.demora, 1)} ${unidad}`}
                <Semaforo c={f.color} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
