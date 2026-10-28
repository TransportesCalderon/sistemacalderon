'use client';

import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Flag, Gauge, Info, Trophy } from 'lucide-react';
import { TD, TH } from '@/modules/catalogos/components/comun';
import { Cargando, ErrorLectura, Vacio } from '@/modules/combustible/components/comun/ui';
import { usePeriodo } from '@/modules/combustible/components/consumo/periodo';
import { useCamionesCombustible } from '@/modules/combustible/queries/hooks';
import { useSesion } from '@/modules/core/session/session-provider';
import { RepoError } from '@/shared/repository/types';
import { cn } from '@/shared/lib/cn';
import { formatearFechaDia, hoyEnZona } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { browserDb } from '@/shared/supabase/browser';
import type { NivelHoy } from '../domain/flota.types';
import { useDiasChofer } from '../queries/hooks';
import {
  BARRA,
  CHIP,
  Cambio,
  Insignia,
  PartesCalderon,
  Podio,
  Subpuntuaciones,
  nivelDe,
  nombreCorto,
  numDe,
  parsearSubpuntajes,
  texto,
  type Sub,
} from './campeonato-comun';

const f = (v: number | null, dec = 1, sufijo = '') => (v === null ? '—' : `${formatearNumero(v, dec)}${sufijo}`);

interface Corredor {
  choferId: number;
  chofer: string;
  posicion: number | null;
  posicionAnterior: number | null;
  cambio: number | null;
  dias: number;
  camiones: string | null;
  conAcumulados: boolean;
  puntaje: number | null;
  nivel: NivelHoy | null;
  km: number;
  l100km: number | null;
  programadorPct: number | null;
  programadorNivel: NivelHoy | null;
  ralentiPct: number | null;
  ralentiNivel: NivelHoy | null;
  velocidad: number | null;
  velocidadNivel: NivelHoy | null;
  frenadas: number | null;
  frenadasNivel: NivelHoy | null;
  rpmPct: number | null;
  rpmNivel: NivelHoy | null;
  alertas: number;
  alertasNivel: NivelHoy | null;
  calderon: { puntaje: number | null; nivel: NivelHoy | null; viajes: number; partes: Record<string, number> } | null;
  eco10: number | null;
  ecoNivel: NivelHoy | null;
  diasAbusivo: number | null;
  diasConDato: number | null;
  subpuntajes: Record<string, Sub>;
}

type J = Record<string, unknown>;
async function leer(desde: string, hasta: string) {
  const { data, error } = await browserDb().schema('tel').rpc('fn_campeonato_choferes', { p_desde: desde, p_hasta: hasta });
  if (error) throw new RepoError(error);
  const d = (data ?? {}) as J;
  return {
    flota: numDe(d.flota),
    anteriorDesde: typeof d.anterior_desde === 'string' ? d.anterior_desde : null,
    anteriorHasta: typeof d.anterior_hasta === 'string' ? d.anterior_hasta : null,
    choferes: (Array.isArray(d.choferes) ? (d.choferes as J[]) : []).map((c): Corredor => {
      const cal = c.calderon && typeof c.calderon === 'object' ? (c.calderon as J) : null;
      return {
        choferId: Number(c.chofer_id),
        chofer: String(c.chofer ?? ''),
        posicion: numDe(c.posicion),
        posicionAnterior: numDe(c.posicion_anterior),
        cambio: numDe(c.cambio),
        dias: Number(c.dias ?? 0),
        camiones: typeof c.camiones === 'string' ? c.camiones : null,
        conAcumulados: c.con_acumulados === true,
        puntaje: numDe(c.puntaje),
        nivel: nivelDe(c.nivel),
        km: Number(c.km ?? 0),
        l100km: numDe(c.l_100km),
        programadorPct: numDe(c.programador_pct),
        programadorNivel: nivelDe(c.programador_nivel),
        ralentiPct: numDe(c.ralenti_pct),
        ralentiNivel: nivelDe(c.ralenti_nivel),
        velocidad: numDe(c.velocidad_min_100km),
        velocidadNivel: nivelDe(c.velocidad_nivel),
        frenadas: numDe(c.frenadas_s_100km),
        frenadasNivel: nivelDe(c.frenadas_nivel),
        rpmPct: numDe(c.rpm_alta_pct),
        rpmNivel: nivelDe(c.rpm_nivel),
        alertas: Number(c.alertas ?? 0),
        alertasNivel: nivelDe(c.alertas_nivel),
        calderon: cal
          ? { puntaje: numDe(cal.puntaje), nivel: nivelDe(cal.nivel), viajes: Number(cal.viajes ?? 0), partes: (cal.partes ?? {}) as Record<string, number> }
          : null,
        eco10: numDe(c.eco_10),
        ecoNivel: nivelDe(c.eco_nivel),
        diasAbusivo: numDe(c.dias_abusivo),
        diasConDato: numDe(c.dias_con_dato_abusivo),
        subpuntajes: parsearSubpuntajes(c.subpuntajes),
      };
    }),
  };
}

/** Celda con chip de color (el color lo decide la base). */
function Chip({ v, n }: { v: string; n: NivelHoy | null }) {
  if (v === '—') return <span className="text-tinta-suave">—</span>;
  return <span className={cn('inline-block rounded-md px-2 py-0.5 text-xs font-bold tabular-nums', n ? CHIP[n] : 'bg-fondo text-tinta')}>{v}</span>;
}

const primeroDelMes = (d: string) => `${d.slice(0, 8)}01`;
const finDelMesAnterior = (d: string) => {
  const x = new Date(`${d.slice(0, 8)}01T12:00:00Z`);
  x.setUTCDate(0);
  return x.toISOString().slice(0, 10);
};

/**
 * Flota › Choferes › Puntaje de manejo (migraciones 49 y 108), en formato campeonato: podio, tabla de posiciones con
 * los puestos ganados o perdidos contra el período anterior, cada parte con su color y la ficha de cada chofer con las
 * subpuntuaciones de la marca (como Optifleet), su Puntaje Calderón y el día por día. Todo lo calcula la base.
 */
export function PuntajeChoferesPantalla() {
  const { zonaHoraria } = useSesion();
  const hoy = hoyEnZona(zonaHoraria) as string;
  const [p, setP] = usePeriodo('/telemetria/choferes');
  const [abierto, setAbierto] = useState<number | null>(null);
  const { data, isPending, isError, error, isFetching, refetch } = useQuery({
    queryKey: ['telemetria', 'campeonato', p.desde, p.hasta],
    queryFn: () => leer(p.desde, p.hasta),
  });
  const conPuesto = (data?.choferes ?? []).filter((c) => c.posicion !== null);
  const rapidos: [string, string, string][] = [
    ['Este mes', primeroDelMes(hoy), hoy],
    ['Mes pasado', primeroDelMes(finDelMesAnterior(hoy)), finDelMesAnterior(hoy)],
  ];

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-[#0f172a] via-[#14532d] to-[#0f172a] p-5 text-white shadow-lg sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <Flag className="size-5 text-[#facc15]" />
          <p className="text-xs font-bold tracking-[0.2em] text-white/70 uppercase">Ranking de manejo</p>
          <span className="flex-1" />
          {rapidos.map(([t, d, h]) => (
            <button
              key={t}
              type="button"
              onClick={() => setP({ ...p, desde: d, hasta: h })}
              className={cn('rounded-full px-3 py-1 text-xs font-semibold', p.desde === d && p.hasta === h ? 'bg-white text-[#0f172a]' : 'bg-white/10 hover:bg-white/20')}
            >
              {t}
            </button>
          ))}
          <input
            type="date"
            aria-label="Desde"
            value={p.desde}
            max={p.hasta}
            onChange={(e) => e.target.value && setP({ ...p, desde: e.target.value })}
            className="h-8 rounded-md border border-white/20 bg-white/10 px-2 text-sm text-white [color-scheme:dark]"
          />
          <span className="text-white/60">a</span>
          <input
            type="date"
            aria-label="Hasta"
            value={p.hasta}
            min={p.desde}
            onChange={(e) => e.target.value && setP({ ...p, hasta: e.target.value })}
            className="h-8 rounded-md border border-white/20 bg-white/10 px-2 text-sm text-white [color-scheme:dark]"
          />
        </div>
        <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
          {formatearFechaDia(p.desde)} — {formatearFechaDia(p.hasta)}
        </h1>
        <p className="mt-1 text-sm text-white/70">
          {conPuesto.length} {conPuesto.length === 1 ? 'chofer' : 'choferes'} en carrera
          {data?.flota != null && ` · promedio de la flota ${formatearNumero(data.flota, 0)} puntos`}
          {data?.anteriorDesde && data.anteriorHasta && ` · se compara con ${formatearFechaDia(data.anteriorDesde)} a ${formatearFechaDia(data.anteriorHasta)}`}
        </p>
        {conPuesto.length > 0 && (
          <div className="mx-auto mt-6 max-w-2xl">
            <Podio top={conPuesto.slice(0, 3).map((c) => ({ ...c, clave: c.choferId, nombre: c.chofer }))} />
          </div>
        )}
      </section>

      {isPending ? (
        <Cargando texto="Armando el ranking…" />
      ) : isError ? (
        <ErrorLectura texto={error instanceof Error ? error.message : 'No se pudo calcular el puntaje.'} onReintentar={() => refetch()} />
      ) : data.choferes.length === 0 ? (
        <Vacio icono={<Gauge className="size-6" />} texto="No hay conducción registrada en el período." />
      ) : (
        <section className={cn('overflow-hidden rounded-2xl border border-borde bg-panel shadow-sm', isFetching && 'opacity-70')}>
          <div className="flex items-center gap-2 border-b border-borde bg-fondo px-4 py-2.5">
            <Trophy className="size-4 text-marca" />
            <h2 className="font-bold text-tinta">Tabla de posiciones</h2>
            <span className="text-xs text-tinta-suave">· tocá un chofer para ver su ficha</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px] text-sm">
              <thead className="text-[11px] tracking-wide text-tinta-suave uppercase">
                <tr className="border-b border-borde">
                  <th className="px-3 py-2 text-left">Pos.</th>
                  <th className="px-2 py-2 text-left">vs. antes</th>
                  <th className="px-3 py-2 text-left">Chofer</th>
                  <th className="w-44 px-3 py-2 text-left">Puntaje</th>
                  <th className="px-2 py-2 text-center" title="Puntaje Calderón de sus viajes aprobados">
                    Calderón
                  </th>
                  <th className="px-2 py-2 text-right">Km</th>
                  <th className="px-2 py-2 text-right">L/100</th>
                  <th className="px-2 py-2 text-center">Progr.</th>
                  <th className="px-2 py-2 text-center">Ralentí</th>
                  <th className="px-2 py-2 text-center" title="Minutos por encima de la velocidad máxima cada 100 km">
                    Exceso vel.
                  </th>
                  <th className="px-2 py-2 text-center" title="Segundos de frenada fuerte cada 100 km">
                    Frenadas
                  </th>
                  <th className="px-2 py-2 text-center">Rev. altas</th>
                  <th className="px-2 py-2 text-center">Alertas</th>
                  <th className="px-2 py-2 text-center">Eco /10</th>
                  <th className="px-2 py-2 text-center">Abusivo</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {data.choferes.map((c) => {
                  const abiertoAqui = abierto === c.choferId;
                  return (
                    <Fragment key={c.choferId}>
                      <tr
                        className={cn('cursor-pointer border-b border-borde hover:bg-hover', c.posicion === null && 'opacity-70', abiertoAqui && 'bg-marca-suave/40')}
                        onClick={() => setAbierto(abiertoAqui ? null : c.choferId)}
                      >
                        <td className="px-3 py-2.5">
                          <Insignia posicion={c.posicion} />
                        </td>
                        <td className="px-2 py-2.5">
                          <Cambio c={c} />
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="font-semibold text-tinta">{nombreCorto(c.chofer)}</span>
                          <span className="block text-[11px] text-tinta-suave">
                            {c.dias} {c.dias === 1 ? 'día' : 'días'}
                            {c.camiones && ` · ${c.camiones}`}
                            {!c.conAcumulados && ' · solo posición'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          {c.puntaje !== null ? (
                            <div className="flex items-center gap-2">
                              <span className={cn('w-8 text-lg font-black tabular-nums', texto(c.nivel))}>{formatearNumero(c.puntaje, 0)}</span>
                              <div className="h-2 flex-1 rounded-full bg-fondo">
                                <div className={cn('h-2 rounded-full', c.nivel ? BARRA[c.nivel] : 'bg-tinta')} style={{ width: `${Math.max(0, Math.min(100, c.puntaje))}%` }} />
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-tinta-suave">menos de 100 km</span>
                          )}
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <Chip v={c.calderon?.puntaje != null ? formatearNumero(c.calderon.puntaje, 0) : '—'} n={c.calderon?.nivel ?? null} />
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{formatearNumero(c.km, 0)}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{f(c.l100km)}</td>
                        <td className="px-2 py-2.5 text-center">
                          <Chip v={f(c.programadorPct, 0, ' %')} n={c.programadorNivel} />
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <Chip v={f(c.ralentiPct, 0, ' %')} n={c.ralentiNivel} />
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <Chip v={f(c.velocidad, 1, ' min')} n={c.velocidadNivel} />
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <Chip v={f(c.frenadas, 0, ' s')} n={c.frenadasNivel} />
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <Chip v={f(c.rpmPct, 0, ' %')} n={c.rpmNivel} />
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <Chip v={String(c.alertas)} n={c.alertasNivel} />
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <Chip v={c.eco10 === null ? '—' : formatearNumero(c.eco10, 1)} n={c.ecoNivel} />
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          {c.diasConDato ? (
                            <Chip v={c.diasAbusivo ? `${c.diasAbusivo} ${c.diasAbusivo === 1 ? 'día' : 'días'}` : 'Ninguno'} n={c.diasAbusivo ? 'rojo' : 'verde'} />
                          ) : (
                            <span className="text-tinta-suave">—</span>
                          )}
                        </td>
                        <td className="px-2 py-2.5 text-tinta-suave">{abiertoAqui ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}</td>
                      </tr>
                      {abiertoAqui && (
                        <tr>
                          <td colSpan={16} className="p-0">
                            <FichaCorredor c={c} desde={p.desde} hasta={p.hasta} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <p className="flex max-w-4xl gap-2 text-xs text-tinta-suave">
        <Info className="mt-0.5 size-4 shrink-0" />
        Solo informativo. El puntaje de manejo arranca en 100 y resta por poco uso del programador, ralentí, minutos por encima de la velocidad máxima,
        frenadas fuertes, revoluciones altas y alertas; con menos de 100 km no hay puntaje. El color de cada parte muestra cuánto le resta. Calderón: el
        puntaje de sus viajes aprobados. Eco y subpuntuaciones: los de la marca de los días que manejó, ponderados por km.
      </p>
    </div>
  );
}

/** Ficha del chofer: subpuntuaciones de la marca como Optifleet, Puntaje Calderón y el día por día. */
function FichaCorredor({ c, desde, hasta }: { c: Corredor; desde: string; hasta: string }) {
  return (
    <div className="space-y-4 bg-[#0f172a] p-4">
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wider text-white/60 uppercase">Subpuntuaciones de la marca (0 a 10)</p>
          <Subpuntuaciones subpuntajes={c.subpuntajes} />
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wider text-white/60 uppercase">
            Puntaje Calderón{c.calderon ? ` · ${c.calderon.viajes} ${c.calderon.viajes === 1 ? 'viaje aprobado' : 'viajes aprobados'}` : ''}
          </p>
          {c.calderon ? <PartesCalderon partes={c.calderon.partes} /> : <p className="text-sm text-white/60">Sin viajes aprobados en el período.</p>}
        </div>
      </div>
      <DiasChofer chofer={c} desde={desde} hasta={hasta} />
    </div>
  );
}

function DiasChofer({ chofer, desde, hasta }: { chofer: Corredor; desde: string; hasta: string }) {
  const { data, isPending, isError, refetch } = useDiasChofer(chofer.choferId, desde, hasta);
  const { data: camiones } = useCamionesCombustible();
  const patente = (id: number) => camiones?.find((c) => c.id === id)?.patente ?? `#${id}`;
  return (
    <section className="space-y-3 rounded-xl bg-panel p-5" aria-label={`Días de ${chofer.chofer}`}>
      <h2 className="font-medium text-tinta">Día por día · {chofer.chofer}</h2>
      {isPending ? (
        <Cargando texto="Cargando…" />
      ) : isError ? (
        <ErrorLectura texto="No se pudo cargar el detalle." onReintentar={() => refetch()} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b border-borde">
              <tr>
                <th className={TH}>Día</th>
                <th className={TH}>Camión</th>
                <th className={cn(TH, 'text-right')}>Km</th>
                <th className={cn(TH, 'text-right')}>Litros</th>
                <th className={cn(TH, 'text-right')}>Horas motor</th>
                <th className={cn(TH, 'text-right')}>Ralentí</th>
                <th className={cn(TH, 'text-right')}>Km con programador</th>
                <th className={cn(TH, 'text-right')}>Exceso vel.</th>
                <th className={cn(TH, 'text-right')}>Vel. máx.</th>
                <th className={cn(TH, 'text-right')}>Peso medio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {data.map((d) => (
                <tr key={`${d.fecha}-${d.camionId}`}>
                  <td className={TD}>{formatearFechaDia(d.fecha)}</td>
                  <td className={cn(TD, 'font-mono')}>{patente(d.camionId)}</td>
                  <td className={cn(TD, 'text-right tabular-nums')}>{formatearNumero(d.km, 0)}</td>
                  <td className={cn(TD, 'text-right tabular-nums')}>{f(d.litros, 0)}</td>
                  <td className={cn(TD, 'text-right tabular-nums')}>{f(d.horasMotor, 1, ' h')}</td>
                  <td className={cn(TD, 'text-right tabular-nums')}>{f(d.ralentiH, 1, ' h')}</td>
                  <td className={cn(TD, 'text-right tabular-nums')}>{f(d.programadorKm, 0)}</td>
                  <td className={cn(TD, 'text-right tabular-nums')}>{f(d.sobreVelocidadMin, 0, ' min')}</td>
                  <td className={cn(TD, 'text-right tabular-nums')}>{f(d.velocidadMax, 0, ' km/h')}</td>
                  <td className={cn(TD, 'text-right tabular-nums')}>{d.pesoMedioKg === null ? '—' : `${formatearNumero(d.pesoMedioKg / 1000, 1)} t`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
