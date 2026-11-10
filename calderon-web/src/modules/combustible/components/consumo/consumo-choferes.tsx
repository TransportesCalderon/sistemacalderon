'use client';

import { Fragment, useState } from 'react';
import { Check, ChevronDown, ChevronRight, LoaderCircle, RefreshCw, Sparkles, Users } from 'lucide-react';
import { useEnvio } from '@/modules/catalogos/components/comun';
import { useSesion } from '@/modules/core/session/session-provider';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora, hoyEnZona } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, CONTROL_FILTRO, TARJETA } from '@/shared/ui/clases';
import { VERSION_CONSUMO_APRENDIDO, type ConsumoChofer } from '../../domain/consumo-aprendido.types';
import { useAnalizarConsumoChofer, useConsumoChoferes, useRecalcularConsumoChoferes, useRevisarConsumoChofer } from '../../queries/hooks';
import { Cargando, Chip, ErrorBase, ErrorLectura, Vacio } from '../comun/ui';

const TH = 'px-3 py-2.5 whitespace-nowrap';
const TD = 'px-3 py-2.5 align-top';
const num = (v: number | null, d = 0) => (v === null ? '—' : formatearNumero(v, d));
/** «2026-10» → «2026-10-01». */
const primerDia = (mes: string) => (mes ? `${mes}-01` : '');

/**
 * Migración 223 · Choferes con consumo alto: cada chofer contra lo que consumen los DEMÁS en el mismo camión y ruta
 * (solo litros medidos por el motor). Los que se pasan del umbral quedan marcados; se revisan y se le puede pedir a la
 * IA que explique por qué. Lo calcula la base.
 */
export function ConsumoChoferesPantalla() {
  const hay = useBaseTiene(VERSION_CONSUMO_APRENDIDO);
  const { zonaHoraria } = useSesion();
  const [mes, setMes] = useState(() => {
    const h = hoyEnZona(zonaHoraria);
    const [a, m] = [Number(h.slice(0, 4)), Number(h.slice(5, 7))];
    return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
  });
  const [soloMarcados, setSoloMarcados] = useState(true);
  const [abierto, setAbierto] = useState<number | null>(null);
  const { data, isPending, isError, error, refetch, isFetching } = useConsumoChoferes(primerDia(mes), hay);
  const recalcular = useRecalcularConsumoChoferes();
  const envio = useEnvio();

  if (!hay) return <Vacio icono={<Users className="size-6" />} texto="Falta aplicar en la base el cambio del consumo de los choferes." />;

  const lista = (data?.choferes ?? []).filter((c) => !soloMarcados || c.marcado);
  return (
    <div className="space-y-4">
      <section className={cn(TARJETA, 'flex flex-wrap items-end gap-3 p-3')} aria-label="Filtros">
        <label className="text-sm">
          <span className="block text-xs text-tinta-suave">Mes</span>
          <input type="month" className={CONTROL_FILTRO} value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} />
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-tinta-suave">
          <input type="checkbox" className="accent-marca" checked={soloMarcados} onChange={(e) => setSoloMarcados(e.target.checked)} /> Solo los que consumen de
          más
        </label>
        <button
          type="button"
          className={cn(BOTON_SECUNDARIO, 'ml-auto')}
          disabled={recalcular.isPending}
          onClick={() => void envio.enviar(recalcular.mutateAsync({ mes: primerDia(mes) }), () => undefined)}
        >
          {recalcular.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Recalcular
        </button>
      </section>
      <ErrorBase error={envio.error} />
      {data && (
        <p className="text-xs text-tinta-suave">
          Se compara cada chofer con lo que consumen los demás en el mismo camión y ruta (si hay pocos datos, la misma marca o la ruta). Queda marcado si gasta
          más de un {num(data.umbralPct)} % con al menos {num(data.kmMin)} km comparables.
          {data.calculadoEn && ` Calculado: ${formatearFechaHora(data.calculadoEn, zonaHoraria)}.`}
        </p>
      )}

      {isPending ? (
        <Cargando texto="Comparando el consumo de los choferes…" />
      ) : isError ? (
        <ErrorLectura texto="No se pudo leer el consumo de los choferes." error={error} onReintentar={() => void refetch()} />
      ) : lista.length === 0 ? (
        <Vacio icono={<Users className="size-6" />} texto={soloMarcados ? 'Ningún chofer consume de más en ese mes.' : 'No hay tramos medidos en ese mes.'} />
      ) : (
        <div className={cn(TARJETA, 'overflow-x-auto', isFetching && 'opacity-80')}>
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b border-borde bg-fondo text-left text-xs font-medium tracking-wide text-tinta-suave uppercase">
              <tr>
                <th className={TH} />
                <th className={TH}>Chofer</th>
                <th className={cn(TH, 'text-right')}>Km</th>
                <th className={cn(TH, 'text-right')}>Gastó</th>
                <th className={cn(TH, 'text-right')}>Esperado</th>
                <th className={cn(TH, 'text-right')}>De más</th>
                <th className={TH}>Desvío</th>
                <th className={cn(TH, 'text-right')}>Programador</th>
                <th className={TH}>Revisión</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {lista.map((c) => (
                <Fragment key={c.choferId}>
                  <tr className="cursor-pointer hover:bg-hover" onClick={() => setAbierto(abierto === c.choferId ? null : c.choferId)}>
                    <td className={TD}>{abierto === c.choferId ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</td>
                    <td className={cn(TD, 'font-medium')}>{c.chofer}</td>
                    <td className={cn(TD, 'text-right tabular-nums')}>{num(c.km)}</td>
                    <td className={cn(TD, 'text-right tabular-nums')}>
                      {num(c.litros)} L<span className="block text-xs text-tinta-suave">{num(c.l100km, 1)} L/100</span>
                    </td>
                    <td className={cn(TD, 'text-right tabular-nums')}>{c.litrosEsperados === null ? '—' : `${num(c.litrosEsperados)} L`}</td>
                    <td className={cn(TD, 'text-right tabular-nums')}>{c.litrosDeMas === null ? '—' : `${num(c.litrosDeMas)} L`}</td>
                    <td className={TD}>
                      {c.desvioPct === null ? (
                        <span className="text-tinta-suave">sin comparar</span>
                      ) : (
                        <Chip tono={c.marcado ? 'error' : c.desvioPct > 0 ? 'alerta' : 'exito'}>
                          {c.desvioPct > 0 ? '+' : ''}
                          {num(c.desvioPct, 1)} %
                        </Chip>
                      )}
                    </td>
                    <td className={cn(TD, 'text-right tabular-nums')}>
                      {c.programadorPct === null ? '—' : `${num(c.programadorPct, 1)} %`}
                      {c.programadorOtrosPct !== null && <span className="block text-xs text-tinta-suave">los demás {num(c.programadorOtrosPct, 1)} %</span>}
                    </td>
                    <td className={cn(TD, 'text-xs')}>{c.revisadoEn ? <Chip tono="exito">revisado</Chip> : c.marcado ? <Chip tono="alerta">sin revisar</Chip> : '—'}</td>
                  </tr>
                  {abierto === c.choferId && (
                    <tr>
                      <td colSpan={9} className="bg-fondo p-3">
                        <DetalleChofer c={c} mes={primerDia(mes)} iaDisponible={data.iaDisponible} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DetalleChofer({ c, mes, iaDisponible }: { c: ConsumoChofer; mes: string; iaDisponible: boolean }) {
  const { zonaHoraria } = useSesion();
  const revisar = useRevisarConsumoChofer();
  const analizar = useAnalizarConsumoChofer();
  const envio = useEnvio();
  const [comentario, setComentario] = useState(c.comentario ?? '');
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-left text-xs text-tinta-suave">
            <tr>
              <th className={TH}>Fecha</th>
              <th className={TH}>Camión</th>
              <th className={TH}>Ruta</th>
              <th className={cn(TH, 'text-right')}>Km</th>
              <th className={cn(TH, 'text-right')}>L/100 km</th>
              <th className={cn(TH, 'text-right')}>Esperado</th>
              <th className={cn(TH, 'text-right')}>Programador</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {c.detalle.map((t) => (
              <tr key={t.tramoId}>
                <td className={cn(TD, 'whitespace-nowrap tabular-nums')}>{formatearFechaHora(t.inicio, zonaHoraria)}</td>
                <td className={cn(TD, 'font-mono')}>{t.camion}</td>
                <td className={TD}>
                  {t.origen} → {t.destino} <span className="text-xs text-tinta-suave">({t.conCarga ? 'cargado' : 'vacío'})</span>
                </td>
                <td className={cn(TD, 'text-right tabular-nums')}>{num(t.km)}</td>
                <td
                  className={cn(
                    TD,
                    'text-right tabular-nums',
                    t.esperadoL100km !== null && t.l100km !== null && t.l100km > t.esperadoL100km * 1.1 && 'font-semibold text-error',
                  )}
                >
                  {num(t.l100km, 1)}
                </td>
                <td className={cn(TD, 'text-right tabular-nums')} title={t.base ?? undefined}>
                  {num(t.esperadoL100km, 1)}
                </td>
                <td className={cn(TD, 'text-right tabular-nums')}>{t.programadorPct === null ? '—' : `${num(t.programadorPct, 1)} %`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-2 rounded-md border border-borde bg-panel p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Sparkles className="size-4 text-marca" />
          <span className="text-sm font-semibold text-tinta">Análisis de la IA</span>
          {iaDisponible && (
            <button
              type="button"
              className={cn(BOTON_SECUNDARIO, 'ml-auto')}
              disabled={analizar.isPending || c.iaEstado === 'esperando'}
              onClick={() => void envio.enviar(analizar.mutateAsync({ mes, chofer: c.choferId }), () => undefined)}
            >
              {c.iaEstado === 'esperando' ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {c.iaTexto ? 'Volver a analizar' : 'Pedir análisis'}
            </button>
          )}
        </div>
        {!iaDisponible && <p className="text-xs text-tinta-suave">La IA no está disponible (falta la clave en Vault o pg_net): pedíselo a TI.</p>}
        {c.iaEstado === 'esperando' && <p className="text-sm text-tinta-suave">La IA está analizando los tramos…</p>}
        {c.iaEstado === 'error' && <p className="text-sm text-error">{c.iaError}</p>}
        {c.iaTexto && c.iaEstado !== 'esperando' && <p className="whitespace-pre-line text-sm text-tinta">{c.iaTexto}</p>}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-72 flex-1 space-y-1 text-sm">
          <span className="block text-xs text-tinta-suave">
            Revisión {c.revisadoPor && `(última: ${c.revisadoPor}${c.revisadoEn ? `, ${formatearFechaHora(c.revisadoEn, zonaHoraria)}` : ''})`}
          </span>
          <input className={cn(CONTROL_FILTRO, 'h-9 w-full')} placeholder="Qué se vio o qué se habló con el chofer" value={comentario} onChange={(e) => setComentario(e.target.value)} />
        </label>
        <button
          type="button"
          className={BOTON_PRIMARIO}
          disabled={revisar.isPending}
          onClick={() => void envio.enviar(revisar.mutateAsync({ mes, chofer: c.choferId, comentario }), () => undefined)}
        >
          {revisar.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} Marcar revisado
        </button>
      </div>
      <ErrorBase error={envio.error} />
    </div>
  );
}
