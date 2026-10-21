'use client';

import { useState } from 'react';
import { Gauge, Info } from 'lucide-react';
import { TD, TH } from '@/modules/catalogos/components/comun';
import { Cargando, Encabezado, ErrorLectura, Vacio } from '@/modules/combustible/components/comun/ui';
import { FiltroPeriodo, usePeriodo } from '@/modules/combustible/components/consumo/periodo';
import { useCamionesCombustible } from '@/modules/combustible/queries/hooks';
import { cn } from '@/shared/lib/cn';
import { formatearFechaDia } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import type { PuntajeChofer } from '../domain/conduccion.types';
import { useDiasChofer, usePuntajesChoferes } from '../queries/hooks';

const f = (v: number | null, dec = 1, sufijo = '') => (v === null ? '—' : `${formatearNumero(v, dec)}${sufijo}`);

function tonoPuntaje(p: number | null) {
  if (p === null) return 'text-tinta-suave';
  if (p >= 80) return 'text-exito';
  if (p >= 60) return 'text-alerta';
  return 'text-error';
}

/**
 * Flota > Puntaje de choferes (migración 49). Solo informativo: no descuenta ni premia.
 * Sale de la telemetría (programador de velocidad, ralentí, velocidad, frenadas, revoluciones)
 * y de las alertas del período. Lo calcula la base (tel.fn_puntaje_choferes).
 */
export function PuntajeChoferesPantalla() {
  const [p, setP] = usePeriodo('/telemetria/choferes');
  const { data, isPending, isError, error, isFetching, refetch } = usePuntajesChoferes(p.desde, p.hasta);
  const [elegido, setElegido] = useState<PuntajeChofer | null>(null);

  return (
    <div className="space-y-5">
      <Encabezado titulo="Puntaje de choferes" subtitulo="Flota" />
      <p className="flex max-w-3xl gap-2 text-sm text-tinta-suave">
        <Info className="mt-0.5 size-4 shrink-0" />
        Solo informativo. Arranca en 100 y resta por poco uso del programador de velocidad, ralentí, minutos por encima de la velocidad máxima,
        frenadas fuertes, revoluciones altas y alertas. Con menos de 100 km en el período no hay puntaje.
      </p>
      <FiltroPeriodo p={p} onCambiar={setP} />
      {isPending ? (
        <Cargando texto="Calculando…" />
      ) : isError ? (
        <ErrorLectura texto={error instanceof Error ? error.message : 'No se pudo calcular el puntaje.'} onReintentar={() => refetch()} />
      ) : data.length === 0 ? (
        <Vacio icono={<Gauge className="size-6" />} texto="No hay conducción registrada en el período." />
      ) : (
        <section className="overflow-hidden rounded-xl border border-borde bg-panel">
          <div className="overflow-x-auto">
            <table className={cn('w-full min-w-[1050px] text-sm', isFetching && 'opacity-70')}>
              <thead className="border-b border-borde bg-fondo">
                <tr>
                  <th className={TH}>Chofer</th>
                  <th className={cn(TH, 'text-right')}>Puntaje</th>
                  <th className={cn(TH, 'text-right')}>Km</th>
                  <th className={cn(TH, 'text-right')}>L/100 km</th>
                  <th className={cn(TH, 'text-right')}>Programador</th>
                  <th className={cn(TH, 'text-right')}>Ralentí</th>
                  <th className={cn(TH, 'text-right')} title="Minutos por encima de la velocidad máxima cada 100 km">
                    Exceso vel.
                  </th>
                  <th className={cn(TH, 'text-right')} title="Segundos de frenada fuerte cada 100 km">
                    Frenadas
                  </th>
                  <th className={cn(TH, 'text-right')}>Rev. altas</th>
                  <th className={cn(TH, 'text-right')}>Alertas</th>
                  <th className={TH}>Camiones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {data.map((c) => (
                  <tr
                    key={c.choferId}
                    className={cn('cursor-pointer hover:bg-hover', elegido?.choferId === c.choferId && 'bg-marca-suave')}
                    onClick={() => setElegido(elegido?.choferId === c.choferId ? null : c)}
                  >
                    <td className={TD}>
                      <span className="font-medium text-tinta">{c.chofer}</span>
                      <span className="block text-xs text-tinta-suave">
                        {c.dias} {c.dias === 1 ? 'día' : 'días'}
                        {!c.conAcumulados && ' · solo posición (sin datos de manejo)'}
                      </span>
                    </td>
                    <td className={cn(TD, 'text-right text-lg font-semibold tabular-nums', tonoPuntaje(c.puntaje))}>{f(c.puntaje, 0)}</td>
                    <td className={cn(TD, 'text-right tabular-nums')}>{formatearNumero(c.km, 0)}</td>
                    <td className={cn(TD, 'text-right tabular-nums')}>{f(c.l100km)}</td>
                    <td className={cn(TD, 'text-right tabular-nums')}>{f(c.programadorPct, 0, ' %')}</td>
                    <td className={cn(TD, 'text-right tabular-nums')}>{f(c.ralentiPct, 0, ' %')}</td>
                    <td className={cn(TD, 'text-right tabular-nums')}>{f(c.sobreVelocidadMin100km, 1, ' min')}</td>
                    <td className={cn(TD, 'text-right tabular-nums')}>{f(c.frenadaFuerteS100km, 0, ' s')}</td>
                    <td className={cn(TD, 'text-right tabular-nums')}>{f(c.rpmAltaPct, 0, ' %')}</td>
                    <td className={cn(TD, 'text-right tabular-nums')}>{c.alertas}</td>
                    <td className={cn(TD, 'text-tinta-suave')}>{c.camiones ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {elegido && <DiasChofer chofer={elegido} desde={p.desde} hasta={p.hasta} />}
    </div>
  );
}

function DiasChofer({ chofer, desde, hasta }: { chofer: PuntajeChofer; desde: string; hasta: string }) {
  const { data, isPending, isError, refetch } = useDiasChofer(chofer.choferId, desde, hasta);
  const { data: camiones } = useCamionesCombustible();
  const patente = (id: number) => camiones?.find((c) => c.id === id)?.patente ?? `#${id}`;
  return (
    <section className="space-y-3 rounded-xl border border-borde bg-panel p-5" aria-label={`Días de ${chofer.chofer}`}>
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
