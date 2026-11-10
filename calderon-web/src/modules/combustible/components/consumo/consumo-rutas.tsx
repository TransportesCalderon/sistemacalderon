'use client';

import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight, Route } from 'lucide-react';
import { useSesion } from '@/modules/core/session/session-provider';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { TARJETA } from '@/shared/ui/clases';
import { VERSION_CONSUMO_APRENDIDO, type LitrosRuta } from '../../domain/consumo-aprendido.types';
import { useConsumoRutas } from '../../queries/hooks';
import { Cargando, ErrorLectura, Vacio } from '../comun/ui';
import { Cifra } from './periodo';

const TH = 'px-3 py-2.5 whitespace-nowrap';
const TD = 'px-3 py-2.5 align-top';
const num = (v: number | null, d = 0) => (v === null ? '—' : formatearNumero(v, d));

/**
 * Migración 223 · Consumo por ruta: lo que midió el motor en cada ruta (cargado o vacío), aprendido de los tramos
 * terminados, y los litros que necesita cada camión para lo que le falta (tramo en curso y planificados).
 */
export function ConsumoRutasPantalla() {
  const hay = useBaseTiene(VERSION_CONSUMO_APRENDIDO);
  const { zonaHoraria } = useSesion();
  const { data, isPending, isError, error, refetch } = useConsumoRutas(hay);
  const [abierta, setAbierta] = useState<string | null>(null);

  if (!hay) return <Vacio icono={<Route className="size-6" />} texto="Falta aplicar en la base el cambio del consumo por ruta." />;
  if (isPending) return <Cargando texto="Leyendo lo aprendido…" />;
  if (isError) return <ErrorLectura texto="No se pudo leer el consumo por ruta." error={error} onReintentar={() => void refetch()} />;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Cifra etiqueta="Tramos medidos (aprendidos)" valor={formatearNumero(data.aprendidos, 0)} detalle="Km y litros que midió el motor" />
        <Cifra etiqueta="Tramos sin medir" valor={formatearNumero(data.sinMedir, 0)} detalle="Sin litros de la telemetría: no cuentan" />
        <Cifra etiqueta="Última actualización" valor={data.ultimo ? formatearFechaHora(data.ultimo, zonaHoraria) : '—'} detalle="Aprende sola, cada hora" />
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-tinta">Litros que necesita cada camión para lo que le falta</h2>
        {data.camiones.length === 0 ? (
          <p className="text-sm text-tinta-suave">Ningún camión tiene tramos en curso o planificados.</p>
        ) : (
          <div className={cn(TARJETA, 'overflow-x-auto')}>
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-borde bg-fondo text-left text-xs font-medium tracking-wide text-tinta-suave uppercase">
                <tr>
                  <th className={TH}>Camión</th>
                  <th className={TH}>Recorrido</th>
                  <th className={cn(TH, 'text-right')}>Km</th>
                  <th className={cn(TH, 'text-right')}>Litros</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {data.camiones.map((c) => (
                  <tr key={c.camionId}>
                    <td className={cn(TD, 'font-mono font-semibold')}>{c.patente}</td>
                    <td className={TD}>
                      <Recorrido p={c.pendiente} />
                    </td>
                    <td className={cn(TD, 'text-right tabular-nums')}>{num(c.pendiente.km)}</td>
                    <td className={cn(TD, 'text-right tabular-nums font-semibold')}>
                      {num(c.pendiente.litros)} L
                      {!c.pendiente.completo && <span className="block text-xs font-normal text-alerta">faltan datos de {c.pendiente.sinDato} tramo(s)</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-tinta">Consumo medido por ruta</h2>
        {data.rutas.length === 0 ? (
          <Vacio icono={<Route className="size-6" />} texto="Todavía no hay tramos medidos: el sistema aprende a medida que se terminan los viajes." />
        ) : (
          <div className={cn(TARJETA, 'overflow-x-auto')}>
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-borde bg-fondo text-left text-xs font-medium tracking-wide text-tinta-suave uppercase">
                <tr>
                  <th className={TH} />
                  <th className={TH}>Ruta</th>
                  <th className={TH}>Carga</th>
                  <th className={cn(TH, 'text-right')}>Tramos</th>
                  <th className={cn(TH, 'text-right')}>Km</th>
                  <th className={cn(TH, 'text-right')}>L/100 km</th>
                  <th className={cn(TH, 'text-right')}>Mín – máx</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {data.rutas.map((r) => {
                  const k = `${r.origen}|${r.destino}|${r.conCarga}`;
                  return (
                    <Fragment key={k}>
                      <tr className="cursor-pointer hover:bg-hover" onClick={() => setAbierta(abierta === k ? null : k)}>
                        <td className={TD}>{abierta === k ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</td>
                        <td className={TD}>
                          {r.origen} → {r.destino}
                        </td>
                        <td className={TD}>{r.conCarga ? 'Cargado' : 'Vacío'}</td>
                        <td className={cn(TD, 'text-right tabular-nums')}>{r.tramos}</td>
                        <td className={cn(TD, 'text-right tabular-nums')}>{num(r.km)}</td>
                        <td className={cn(TD, 'text-right tabular-nums font-semibold')}>{num(r.l100km, 1)}</td>
                        <td className={cn(TD, 'text-right tabular-nums text-tinta-suave')}>
                          {num(r.min, 1)} – {num(r.max, 1)}
                        </td>
                      </tr>
                      {abierta === k && (
                        <tr>
                          <td colSpan={7} className="bg-fondo px-10 py-2 text-sm">
                            {r.porMarca.map((m) => (
                              <span key={m.marca} className="mr-4 inline-block">
                                {m.marca}: <strong className="tabular-nums">{num(m.l100km, 1)}</strong> L/100 km ({m.tramos} tramos)
                              </span>
                            ))}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-tinta-suave">
          Solo cuenta lo que midió el motor (telemetría). Para cada camión usa, en este orden: ese camión en esa ruta, la misma marca en esa ruta, todos en
          esa ruta, el camión en general o la marca en general.
        </p>
      </section>
    </div>
  );
}

export function Recorrido({ p }: { p: LitrosRuta }) {
  return (
    <ul className="space-y-0.5">
      {p.tramos.map((t, i) => (
        <li key={i} className="text-sm">
          {t.origen} → {t.destino} <span className="text-xs text-tinta-suave">({t.conCarga ? 'cargado' : 'vacío'}{t.estado === 'en_curso' ? ', lo que falta' : ''})</span>
          {t.litros !== null ? (
            <span className="ml-1 tabular-nums">
              · {num(t.km)} km × {num(t.l100km, 1)} = <strong>{num(t.litros)} L</strong>
              <span className="block text-xs text-tinta-suave">{t.texto}</span>
            </span>
          ) : (
            <span className="ml-1 text-xs text-alerta">· {t.motivo}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
