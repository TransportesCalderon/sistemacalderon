'use client';

import { useMemo, useState } from 'react';
import { LoaderCircle, Plus, TriangleAlert, X } from 'lucide-react';
import { useUbicaciones } from '@/modules/catalogos/queries/hooks';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { CONTROL_FILTRO } from '@/shared/ui/clases';
import { datosCuantoCargar, FUENTE_KM, paradasCompletas, type ParadaRecorrido } from '../domain/cuanto-cargar';
import { useCuantoCargar } from '../queries/hooks';
import { BotonCopiar } from './boton-copiar';

const MAX_PARADAS = 10;
const litros = (v: number | null) => (v === null ? '—' : `${formatearNumero(v, 0)} L`);
const leerLitros = (s: string): number | null => {
  const t = s.trim().replace(/\./g, '').replace(',', '.');
  return t === '' || !Number.isFinite(Number(t)) ? null : Number(t);
};

/**
 * Migración 309 · ¿Cuánto cargar para llegar? Sale desde donde está el camión (GPS) o desde un lugar, pasa por las
 * paradas en orden (cada tramo cargado o vacío) y la base suma los km y el consumo medido de los camiones en cada
 * tramo. Muestra lo justo (llega sin reserva) y lo recomendado (llega con la reserva para no rabear ni quedar tirado).
 */
export function CuantoCargar({ camionId, patente, onCerrar }: { camionId: number; patente: string; onCerrar: () => void }) {
  const { zonaHoraria } = useSesion();
  const lugares = useUbicaciones();
  const [desde, setDesde] = useState('');
  const [paradas, setParadas] = useState<ParadaRecorrido[]>([{ lugarId: null, conCarga: true }]);
  const [litrosTxt, setLitrosTxt] = useState('');
  const [litrosAMano, setLitrosAMano] = useState<number | null>(null);
  const ordenados = useMemo(() => [...(lugares.data ?? [])].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')), [lugares.data]);
  const listo = paradasCompletas(paradas);
  const q = useCuantoCargar(camionId, listo ? datosCuantoCargar(desde ? Number(desde) : null, paradas, litrosAMano) : null);
  const r = q.data;
  const cambiar = (i: number, p: Partial<ParadaRecorrido>) => setParadas(paradas.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const opciones = ordenados.map((u) => (
    <option key={u.id} value={u.id}>
      {u.nombre}
      {u.pais ? ` (${u.pais})` : ''}
    </option>
  ));

  return (
    <div className="space-y-3 rounded-md border border-borde p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-tinta">¿Cuánto cargar para llegar? · {patente}</p>
        <button type="button" className="text-xs text-tinta-suave hover:underline" onClick={onCerrar}>
          Cerrar
        </button>
      </div>

      <label className="block text-xs text-tinta-suave">
        Sale desde
        <select className={cn(CONTROL_FILTRO, 'mt-0.5 w-full')} value={desde} onChange={(e) => setDesde(e.target.value)}>
          <option value="">Donde está ahora (GPS)</option>
          {opciones}
        </select>
      </label>

      <div className="space-y-1.5">
        <p className="text-xs text-tinta-suave">Paradas, en orden (la última es a donde tiene que llegar, por ejemplo la estación)</p>
        {paradas.map((p, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <span className="w-5 text-right text-xs tabular-nums text-tinta-suave">{i + 1}.</span>
            <select
              aria-label={`Lugar de la parada ${i + 1}`}
              className={cn(CONTROL_FILTRO, 'min-w-[12rem] flex-1')}
              value={p.lugarId ?? ''}
              onChange={(e) => cambiar(i, { lugarId: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">Elegí el lugar…</option>
              {opciones}
            </select>
            <div className="inline-flex overflow-hidden rounded-md border border-borde text-xs" role="group" aria-label={`El tramo hasta la parada ${i + 1}`}>
              {[true, false].map((c) => (
                <button
                  key={String(c)}
                  type="button"
                  aria-pressed={p.conCarga === c}
                  className={cn('px-2.5 py-1.5', p.conCarga === c ? 'bg-marca text-white' : 'bg-panel text-tinta-suave hover:bg-hover')}
                  onClick={() => cambiar(i, { conCarga: c })}
                >
                  {c ? 'Cargado' : 'Vacío'}
                </button>
              ))}
            </div>
            {paradas.length > 1 && (
              <button
                type="button"
                aria-label={`Quitar la parada ${i + 1}`}
                className="rounded-md p-1 text-tinta-suave hover:bg-hover hover:text-error"
                onClick={() => setParadas(paradas.filter((_, j) => j !== i))}
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        ))}
        {paradas.length < MAX_PARADAS && (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-marca hover:underline"
            onClick={() => setParadas([...paradas, { lugarId: null, conCarga: true }])}
          >
            <Plus className="size-3.5" /> Agregar parada
          </button>
        )}
      </div>

      <label className="block max-w-xs text-xs text-tinta-suave">
        Litros que tiene ahora
        <input
          className={cn(CONTROL_FILTRO, 'mt-0.5 w-full')}
          inputMode="decimal"
          placeholder={r?.litrosSistema !== null && r?.litrosSistema !== undefined ? formatearNumero(r.litrosSistema, 0) : 'Los del sistema'}
          value={litrosTxt}
          onChange={(e) => setLitrosTxt(e.target.value)}
          onBlur={() => setLitrosAMano(leerLitros(litrosTxt))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setLitrosAMano(leerLitros(litrosTxt));
          }}
        />
        <span className="mt-0.5 block">
          {r?.litrosSistema !== null && r?.litrosSistema !== undefined
            ? `Vacío = los del sistema (${litros(r.litrosSistema)}, tanques y mochila).`
            : 'Vacío = los del sistema.'}
        </span>
      </label>

      {!listo ? (
        <p className="text-xs text-tinta-suave">Elegí el lugar de cada parada para calcular.</p>
      ) : q.isPending ? (
        <p className="flex items-center gap-2 text-xs text-tinta-suave">
          <LoaderCircle className="size-4 animate-spin" /> Sumando los km y el consumo de cada tramo…
        </p>
      ) : q.isError ? (
        <p className="text-xs text-error">{q.error.message}</p>
      ) : r ? (
        <div className={cn('space-y-3', q.isFetching && 'opacity-60')}>
          {r.falta && (
            <p className="flex items-start gap-2 rounded-md bg-alerta-suave px-3 py-2 text-xs text-alerta">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {r.falta}
            </p>
          )}
          {r.avisos.map((a) => (
            <p key={a} className="flex items-start gap-2 text-xs text-alerta">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {a}
            </p>
          ))}
          {r.desdeGps && r.gpsEn && <p className="text-xs text-tinta-suave">Posición del GPS: {formatearFechaHora(r.gpsEn, zonaHoraria)}.</p>}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-tinta-suave">
                <tr>
                  <th className="py-1 pr-3">Tramo</th>
                  <th className="py-1 pr-3 text-right">Km</th>
                  <th className="py-1 pr-3 text-right">L/100 km</th>
                  <th className="py-1 text-right">Litros</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde tabular-nums">
                {r.tramos.map((t) => (
                  <tr key={t.n} className="align-top text-tinta">
                    <td className="py-1.5 pr-3">
                      <p>
                        {t.desde} → {t.hasta} <span className="text-tinta-suave">({t.conCarga ? 'cargado' : 'vacío'})</span>
                      </p>
                      {t.consumoDe && <p className="text-tinta-suave">Consumo: {t.consumoDe}</p>}
                      {t.falta && <p className="text-error">{t.falta}</p>}
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      {t.km === null ? '—' : formatearNumero(t.km, 0)}
                      {t.fuenteKm && <span className="block text-tinta-suave">{FUENTE_KM[t.fuenteKm] ?? t.fuenteKm}</span>}
                    </td>
                    <td className="py-1.5 pr-3 text-right">{t.l100km === null ? '—' : formatearNumero(t.l100km, 1)}</td>
                    <td className="whitespace-nowrap py-1.5 text-right">{litros(t.litros)}</td>
                  </tr>
                ))}
                <tr className="font-medium text-tinta">
                  <td className="py-1.5 pr-3">Total</td>
                  <td className="py-1.5 pr-3 text-right">{formatearNumero(r.km, 0)}</td>
                  <td />
                  <td className="whitespace-nowrap py-1.5 text-right">{litros(r.litrosNecesarios)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {r.justoL !== null && r.recomendadoL !== null && (
            <>
              <p className="text-xs text-tinta-suave">
                Tiene {litros(r.litrosActuales)}
                {r.litrosAMano ? ' (escritos a mano)' : ' según el sistema'}
                {r.capacidadL !== null && ` · capacidad ${litros(r.capacidadL)}`}.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-borde p-3">
                  <p className="text-xs text-tinta-suave">Justo</p>
                  <p className="text-2xl font-semibold tabular-nums text-tinta">{r.justoL === 0 ? 'No hace falta' : `Cargar ${litros(r.justoL)}`}</p>
                  <p className="text-xs text-tinta-suave">Llega con {litros(r.llegaJustoL)}: sin reserva.</p>
                </div>
                <div className="rounded-lg border-2 border-marca p-3">
                  <p className="text-xs text-tinta-suave">Recomendado</p>
                  <p className="text-2xl font-semibold tabular-nums text-tinta">{r.recomendadoL === 0 ? 'No hace falta' : `Cargar ${litros(r.recomendadoL)}`}</p>
                  <p className="text-xs text-tinta-suave">
                    Llega con {litros(r.llegaRecomendadoL)}: {formatearNumero(r.reservaL, 0)} L de reserva para no rabear ni quedar tirado si se desvía.
                  </p>
                </div>
              </div>
              {r.noEntra && (
                <p className="flex items-start gap-2 rounded-md bg-alerta-suave px-3 py-2 text-xs text-alerta">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" /> Hasta llenar entran {litros(r.entraL)}: no alcanza para llegar con la reserva. Va a
                  tener que cargar en el camino.
                </p>
              )}
            </>
          )}
          {r.texto && (
            <div className="space-y-1.5">
              <p className="rounded-md bg-hover p-2 text-xs text-tinta">{r.texto}</p>
              <BotonCopiar texto={r.texto} />
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
