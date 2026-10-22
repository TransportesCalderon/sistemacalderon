'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCheck, Fuel, LoaderCircle, Search } from 'lucide-react';
import { TD, TH } from '@/modules/catalogos/components/comun';
import { Cargando, Chip, Encabezado, ErrorBase, ErrorLectura, Vacio, type Tono } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import type { ErrorAccion } from '@/server/actions/result';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { browserDb } from '@/shared/supabase/browser';
import { BOTON_PRIMARIO, TARJETA } from '@/shared/ui/clases';
import { aprobarVariosCierres, completarOperacionesViaje } from '../actions/por-cerrar.actions';
import { porCerrarRepository, type EtapaCierre, type ViajePorCerrar } from '../repositories/por-cerrar.repository';

type Grupo = 'aprobar' | 'faltan' | 'viaje';
const GRUPO_DE: Record<EtapaCierre, Grupo> = { listo: 'aprobar', con_diferencia: 'aprobar', faltan_datos: 'faltan', en_viaje: 'viaje' };
const GRUPOS: { id: Grupo; texto: string; ayuda: string }[] = [
  { id: 'aprobar', texto: 'Para aprobar', ayuda: 'Tienen todo. Los que no tienen litros a descontar vienen marcados: revisá los demás y aprobalos juntos.' },
  { id: 'faltan', texto: 'Faltan datos', ayuda: 'Llegaron, pero falta algo para cerrar. Al lado dice qué y cómo resolverlo.' },
  { id: 'viaje', texto: 'En viaje', ayuda: 'Todavía no cargaron a tanque lleno al volver. El cierre se arma solo cuando se registre esa carga.' },
];
const ETAPA: Record<EtapaCierre, { texto: string; tono: Tono }> = {
  listo: { texto: 'Listo', tono: 'exito' },
  con_diferencia: { texto: 'Con litros a descontar', tono: 'alerta' },
  faltan_datos: { texto: 'Faltan datos', tono: 'error' },
  en_viaje: { texto: 'En viaje', tono: 'neutro' },
};

const litros = (v: number | null) => (v === null ? '—' : `${v.toLocaleString('es-AR', { maximumFractionDigits: 1 })} L`);

/** Viajes › Cierres por hacer: todos los viajes sin el combustible aprobado, qué les falta y aprobar varios de una vez. */
export function PorCerrarPantalla() {
  const { zonaHoraria } = useSesion();
  const puedeAprobar = useCan('combustible.cierre_viaje:transicionar');
  const puedeEditar = useCan('operacion.tramos:editar');
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['logistica', 'por-cerrar'],
    queryFn: () => porCerrarRepository(browserDb()).lista(120),
    refetchInterval: 120_000,
  });
  const aprobar = useMutation({ mutationFn: aprobarVariosCierres, onSuccess: () => qc.invalidateQueries() });
  const completar = useMutation({ mutationFn: completarOperacionesViaje, onSuccess: () => qc.invalidateQueries() });
  const [grupo, setGrupo] = useState<Grupo | null>(null);
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [error, setError] = useState<ErrorAccion | null>(null);
  const [resultado, setResultado] = useState<{ aprobados: number; errores: { viaje: string | null; error: string }[] } | null>(null);

  const cuenta = useMemo(() => {
    const c: Record<Grupo, number> = { aprobar: 0, faltan: 0, viaje: 0 };
    for (const v of data ?? []) c[GRUPO_DE[v.etapa]] += 1;
    return c;
  }, [data]);
  const actual: Grupo = grupo ?? (cuenta.aprobar > 0 ? 'aprobar' : cuenta.faltan > 0 ? 'faltan' : 'viaje');
  const filas = (data ?? []).filter((v) => GRUPO_DE[v.etapa] === actual);

  // Al cargar, vienen marcados los que están listos (sin litros a descontar)
  useEffect(() => {
    if (data) setMarcados(new Set(data.filter((v) => v.etapa === 'listo').map((v) => v.viajeId)));
  }, [data]);

  const alternar = (id: number) =>
    setMarcados((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const marcadosAqui = filas.filter((v) => marcados.has(v.viajeId)).map((v) => v.viajeId);

  return (
    <div className="space-y-4">
      <Encabezado titulo="Cierres por hacer" subtitulo="Viajes" />
      <p className="text-sm text-tinta-suave">
        Cada viaje de los últimos 4 meses que todavía no tiene el combustible aprobado. «Aprobar» cierra el viaje y aprueba su combustible, igual que
        «Cerrar y aprobar» en la ficha. Las operaciones del tractor se agregan solas cuando el viaje no tiene ninguna.
      </p>

      <div className="flex flex-wrap gap-2" role="tablist">
        {GRUPOS.map((g) => (
          <button
            key={g.id}
            type="button"
            role="tab"
            aria-selected={actual === g.id}
            onClick={() => setGrupo(g.id)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm',
              actual === g.id ? 'border-marca bg-marca-suave font-medium text-marca' : 'border-borde text-tinta-suave hover:bg-hover',
            )}
          >
            {g.texto} <span className="tabular-nums">({cuenta[g.id]})</span>
          </button>
        ))}
      </div>
      <p className="text-sm text-tinta-suave">{GRUPOS.find((g) => g.id === actual)?.ayuda}</p>

      {actual === 'aprobar' && puedeAprobar && filas.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={BOTON_PRIMARIO}
            disabled={aprobar.isPending || marcadosAqui.length === 0}
            onClick={async () => {
              setError(null);
              setResultado(null);
              const r = await aprobar.mutateAsync({ viajes: marcadosAqui });
              if (r.ok) setResultado(r.data);
              else setError(r.error);
            }}
          >
            {aprobar.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <CheckCheck className="size-4" />} Aprobar los marcados (
            {marcadosAqui.length})
          </button>
          <button type="button" className="text-sm text-marca hover:underline" onClick={() => setMarcados(new Set(filas.map((v) => v.viajeId)))}>
            Marcar todos
          </button>
          <button type="button" className="text-sm text-tinta-suave hover:underline" onClick={() => setMarcados(new Set())}>
            Desmarcar
          </button>
        </div>
      )}
      <ErrorBase error={error} />
      {resultado && (
        <div className="space-y-1 rounded-lg border border-borde p-3 text-sm">
          <p className="font-medium text-tinta">{resultado.aprobados} viaje(s) aprobado(s).</p>
          {resultado.errores.map((e, i) => (
            <p key={i} className="text-error">
              {e.viaje ? `${e.viaje}: ` : ''}
              {e.error}
            </p>
          ))}
        </div>
      )}

      {isLoading ? (
        <Cargando texto="Revisando los viajes…" />
      ) : isError ? (
        <ErrorLectura texto="No se pudieron leer los viajes." onReintentar={() => void refetch()} />
      ) : filas.length === 0 ? (
        <Vacio icono={<CheckCheck className="size-6" />} texto="No hay viajes en este grupo." />
      ) : (
        <div className={cn(TARJETA, 'overflow-x-auto')}>
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-borde">
                {actual === 'aprobar' && <th className={cn(TH, 'w-8')} />}
                <th className={TH}>Viaje</th>
                <th className={TH}>Salió · llegó</th>
                <th className={TH}>Estado</th>
                <th className={cn(TH, 'text-right')}>Km · consumo</th>
                <th className={cn(TH, 'text-right')}>A descontar</th>
                <th className={TH}>{actual === 'aprobar' ? '' : 'Qué falta'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {filas.map((v) => (
                <Fila
                  key={v.viajeId}
                  v={v}
                  zona={zonaHoraria}
                  conMarca={actual === 'aprobar'}
                  marcado={marcados.has(v.viajeId)}
                  onMarcar={() => alternar(v.viajeId)}
                  puedeCompletar={puedeEditar}
                  completando={completar.isPending}
                  onCompletar={async () => {
                    setError(null);
                    const r = await completar.mutateAsync({ viajeId: v.viajeId });
                    if (!r.ok) setError(r.error);
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Fila({
  v,
  zona,
  conMarca,
  marcado,
  onMarcar,
  puedeCompletar,
  completando,
  onCompletar,
}: {
  v: ViajePorCerrar;
  zona: string;
  conMarca: boolean;
  marcado: boolean;
  onMarcar: () => void;
  puedeCompletar: boolean;
  completando: boolean;
  onCompletar: () => void;
}) {
  return (
    <tr className={cn(marcado && conMarca && 'bg-marca-suave/30')}>
      {conMarca && (
        <td className={TD}>
          <input type="checkbox" className="size-4 accent-marca" checked={marcado} onChange={onMarcar} aria-label={`Marcar ${v.numero}`} />
        </td>
      )}
      <td className={TD}>
        <Link href={`/operacion/viajes-chofer/${v.viajeId}`} className="font-medium text-marca hover:underline">
          {v.numero}
        </Link>
        <span className="block text-xs text-tinta-suave">
          <span className="font-mono">{v.patente}</span>
          {v.chofer && ` · ${v.chofer}`}
        </span>
      </td>
      <td className={cn(TD, 'text-xs tabular-nums')}>
        {formatearFechaHora(v.salida, zona)}
        <span className="block text-tinta-suave">
          {v.llegada ? formatearFechaHora(v.llegada, zona) : `hace ${v.dias ?? '?'} días`}
        </span>
      </td>
      <td className={TD}>
        <Chip tono={ETAPA[v.etapa].tono}>{ETAPA[v.etapa].texto}</Chip>
      </td>
      <td className={cn(TD, 'text-right text-xs tabular-nums')}>
        {v.km !== null ? `${v.km.toLocaleString('es-AR')} km` : '—'}
        <span className="block text-tinta-suave">{litros(v.consumoL)}</span>
      </td>
      <td className={cn(TD, 'text-right tabular-nums', (v.aDescontarL ?? 0) > 0 && 'font-semibold text-alerta')}>{litros(v.aDescontarL)}</td>
      <td className={cn(TD, 'max-w-80')}>
        {v.faltan.length > 0 && (
          <ul className="space-y-0.5 text-xs text-tinta">
            {v.faltan.map((f) => (
              <li key={f}>• {f}</li>
            ))}
          </ul>
        )}
        <div className="mt-1 flex flex-wrap gap-3 text-xs">
          {v.operacionesParaAgregar > 0 && puedeCompletar && (
            <button type="button" className="inline-flex items-center gap-1 font-medium text-marca hover:underline" disabled={completando} onClick={onCompletar}>
              <Search className="size-3.5" /> Agregar las operaciones del tractor ({v.operacionesParaAgregar})
            </button>
          )}
          {v.etapa === 'en_viaje' && (
            <Link href={`/combustible/cargas/nueva?camion=${v.camionId}`} className="inline-flex items-center gap-1 font-medium text-marca hover:underline">
              <Fuel className="size-3.5" /> Registrar la carga de llegada
            </Link>
          )}
          {v.etapa !== 'en_viaje' && (
            <Link href={`/operacion/viajes-chofer/${v.viajeId}`} className="text-marca hover:underline">
              Abrir el viaje
            </Link>
          )}
        </div>
      </td>
    </tr>
  );
}
