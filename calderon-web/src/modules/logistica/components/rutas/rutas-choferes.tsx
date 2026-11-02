'use client';

import { Fragment, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, CheckCheck, ChevronDown, ChevronRight, ChevronsUpDown, ExternalLink, Map as MapaIcono, Pencil, Plus, Search, TriangleAlert, Undo2 } from 'lucide-react';
import { Cargando, Chip, ErrorBase, ErrorLectura, Vacio } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import type { ActionResult, ErrorAccion } from '@/server/actions/result';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { invalidar } from '@/shared/query/invalidar';
import { TARJETA } from '@/shared/ui/clases';
import { guardarRutaChofer, llegadaRutaChofer, moverRutaChofer, quitarRutaChofer } from '../../actions/rutas.actions';
import { linkCompleto, type ChoferRutas } from '../../domain/rutas';
import { useRutasChoferes, useRutasDeChofer } from '../../queries/hooks';
import type { RutaTramo } from '../../repositories/rutas.repository';
import { EditorRuta } from './ruta-operacion';

type Orden = 'op' | 'chofer' | 'tractor';
const POR: Record<string, string> = { gps: 'por GPS', chofer: 'avisó el chofer', oficina: 'a mano' };
const TH = 'px-3 py-2 text-left text-xs font-semibold tracking-wide text-tinta-suave uppercase';
const TD = 'px-3 py-2.5 align-top';

/** Número de la operación que lleva ahora (la en curso o la próxima), para ordenar. */
const opActual = (c: ChoferRutas) => c.operaciones[0]?.numero ?? null;

/**
 * Migración 161 · Viajes › Rutas para choferes: tabla de los choferes activos (se ordena por operación,
 * chofer o tractor). Cada fila se abre y muestra la fila de rutas del chofer: las de sus operaciones y
 * los movimientos sueltos. El chofer ve solo la primera que le falta.
 */
export function TablaChoferes() {
  const { data, isPending, isError, error, refetch } = useRutasChoferes();
  const [orden, setOrden] = useState<{ campo: Orden; asc: boolean }>({ campo: 'chofer', asc: true });
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState<number | null>(null);

  const filas = useMemo(() => {
    const t = texto.trim().toLowerCase();
    const lista = (data ?? []).filter(
      (c) => !t || [c.chofer, c.tractor ?? '', ...c.operaciones.map((o) => String(o.numero))].some((x) => x.toLowerCase().includes(t)),
    );
    const valor = (c: ChoferRutas): string | number =>
      orden.campo === 'op' ? (opActual(c) ?? Number.MAX_SAFE_INTEGER) : orden.campo === 'tractor' ? (c.tractor ?? '￿') : c.chofer;
    return [...lista].sort((a, b) => {
      const x = valor(a);
      const y = valor(b);
      const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'es');
      return orden.asc ? r : -r;
    });
  }, [data, texto, orden]);

  const ordenar = (campo: Orden) => setOrden((o) => ({ campo, asc: o.campo === campo ? !o.asc : true }));
  const desvios = (data ?? []).filter((c) => c.desvio).length;

  if (isPending) return <Cargando texto="Buscando los choferes…" />;
  if (isError) return <ErrorLectura texto="No se pudieron leer los choferes." onReintentar={() => void refetch()} error={error} />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {desvios > 0 && (
          <Chip tono="error">
            <TriangleAlert className="size-3.5" /> {desvios === 1 ? '1 camión fuera de la ruta' : `${desvios} camiones fuera de la ruta`}
          </Chip>
        )}
        <label className="ml-auto flex h-9 items-center gap-2 rounded-md border border-borde bg-panel px-3 text-sm">
          <Search className="size-4 text-tinta-suave" />
          <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Chofer, tractor u operación…" className="w-56 bg-transparent outline-none" />
        </label>
      </div>
      {filas.length === 0 ? (
        <Vacio icono={<MapaIcono className="size-6" />} texto="No hay choferes activos con ese filtro." />
      ) : (
        <div className={cn(TARJETA, 'overflow-x-auto')}>
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-borde bg-fondo">
              <tr>
                <th className="w-8" />
                <Encabezado campo="chofer" texto="Chofer" orden={orden} onOrdenar={ordenar} />
                <Encabezado campo="tractor" texto="Tractor" orden={orden} onOrdenar={ordenar} />
                <Encabezado campo="op" texto="Operación" orden={orden} onOrdenar={ordenar} />
                <th className={TH}>Ruta en curso</th>
                <th className={cn(TH, 'text-right')}>Rutas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {filas.map((c) => (
                <Fragment key={c.choferId}>
                  <tr className={cn('cursor-pointer hover:bg-hover', abierto === c.choferId && 'bg-marca-suave/40')} onClick={() => setAbierto(abierto === c.choferId ? null : c.choferId)}>
                    <td className={cn(TD, 'pl-3')}>{abierto === c.choferId ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</td>
                    <td className={cn(TD, 'font-medium text-tinta')}>{c.chofer}</td>
                    <td className={cn(TD, 'font-mono')}>{c.tractor ?? '—'}</td>
                    <td className={TD}>
                      {c.operaciones.length === 0 ? (
                        <span className="text-tinta-suave">Sin operación</span>
                      ) : (
                        c.operaciones.map((o, i) => (
                          <span key={o.servicioId} className={cn('block', i > 0 && 'text-xs text-tinta-suave')}>
                            {o.numero} · {o.origen} → {o.destino}
                            {o.estado === 'en_curso' && i === 0 && <span className="ml-1 text-xs text-marca">(en viaje)</span>}
                          </span>
                        ))
                      )}
                    </td>
                    <td className={TD}>
                      {c.ruta ? (
                        <span>
                          {c.ruta.numero ? `Op. ${c.ruta.numero}` : 'Movimiento'}: {c.ruta.partida} → {c.ruta.destino}
                        </span>
                      ) : (
                        <span className="text-tinta-suave">Sin ruta</span>
                      )}
                      {c.desvio && (
                        <span className="mt-1 block">
                          <Chip tono="error">
                            <TriangleAlert className="size-3.5" /> Fuera de la ruta: {c.desvio.km} km, {c.desvio.minutos} min
                          </Chip>
                        </span>
                      )}
                    </td>
                    <td className={cn(TD, 'text-right tabular-nums')}>{c.pendientes > 0 ? `${c.pendientes} por hacer` : '—'}</td>
                  </tr>
                  {abierto === c.choferId && (
                    <tr>
                      <td colSpan={6} className="bg-fondo/60 px-4 py-3">
                        <RutasDeChofer c={c} />
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

function Encabezado({ campo, texto, orden, onOrdenar }: { campo: Orden; texto: string; orden: { campo: Orden; asc: boolean }; onOrdenar: (c: Orden) => void }) {
  const activo = orden.campo === campo;
  return (
    <th className={TH} aria-sort={activo ? (orden.asc ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onOrdenar(campo)} className={cn('inline-flex items-center gap-1 uppercase hover:text-tinta', activo && 'text-tinta')}>
        {texto}
        {activo ? orden.asc ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" /> : <ChevronsUpDown className="size-3.5" />}
      </button>
    </th>
  );
}

/** La fila de rutas de un chofer: en orden, con agregar (varias seguidas), editar, reordenar y llegadas. */
function RutasDeChofer({ c }: { c: ChoferRutas }) {
  const { zonaHoraria } = useSesion();
  const qc = useQueryClient();
  const puede = useCan('operacion.rutas:editar');
  const { data: rutas, isPending } = useRutasDeChofer(c.choferId);
  const [editando, setEditando] = useState<RutaTramo | 'nueva' | null>(null);
  const [nueva, setNueva] = useState(0);
  const [servicio, setServicio] = useState<number | null>(c.operaciones[0]?.servicioId ?? null);
  const [error, setError] = useState<ErrorAccion | null>(null);
  const [ocupado, setOcupado] = useState(false);
  if (isPending) return <Cargando texto="Leyendo sus rutas…" />;
  const lista = rutas ?? [];
  const enCurso = lista.find((r) => r.estado === 'en_curso');
  const hayHechas = lista.some((r) => r.estado === 'hecha');

  const correr = async (p: Promise<ActionResult<unknown>>) => {
    setError(null);
    setOcupado(true);
    const r = await p;
    setOcupado(false);
    if (!r.ok) return setError(r.error);
    await invalidar(qc, 'operacion');
  };

  if (editando) {
    const ruta = editando === 'nueva' ? null : editando;
    return (
      <EditorRuta
        key={ruta ? `r${ruta.id}` : `n${nueva}`}
        servicioId={ruta?.servicioId ?? servicio ?? 0}
        ruta={ruta}
        titulo={ruta ? `Ruta ${ruta.orden} de ${c.chofer}` : `Nueva ruta para ${c.chofer}`}
        onCerrar={() => setEditando(null)}
        onGuardar={(d) =>
          guardarRutaChofer({ choferId: c.choferId, id: ruta?.id ?? null, version: ruta?.version ?? null, servicioId: ruta ? ruta.servicioId : servicio, ...d })
        }
        onQuitar={ruta ? () => quitarRutaChofer({ choferId: c.choferId, id: ruta.id, version: ruta.version }) : undefined}
        onOtra={() => setNueva((n) => n + 1)}
        extra={
          !ruta && (
            <label className="block space-y-1 text-sm">
              <span className="font-medium text-tinta">¿Para qué es?</span>
              <select
                className="h-9 w-full rounded-md border border-borde bg-panel px-2 text-sm"
                value={servicio ?? ''}
                onChange={(e) => setServicio(e.target.value ? Number(e.target.value) : null)}
              >
                {c.operaciones.map((o) => (
                  <option key={o.servicioId} value={o.servicioId}>
                    Operación {o.numero} · {o.cliente}
                  </option>
                ))}
                <option value="">Movimiento (sin operación)</option>
              </select>
            </label>
          )
        }
      />
    );
  }

  return (
    <div className="space-y-2 text-sm">
      <p className="text-tinta-suave">{c.chofer} ve solo la ruta en curso. Al llegar al destino (GPS o «Llegué al destino») pasa a la siguiente.</p>
      {lista.length === 0 && <p className="text-tinta-suave">Todavía no tiene rutas.</p>}
      {lista.length > 0 && (
        <ol className="space-y-1">
          {lista.map((r, i) => {
            const link = linkCompleto(r.puntos);
            return (
              <li
                key={r.id}
                className={cn(
                  'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-panel px-2 py-1.5',
                  r.estado === 'en_curso' ? 'border-marca' : 'border-borde',
                  r.estado === 'hecha' && 'text-tinta-suave',
                )}
              >
                <span className="w-6 shrink-0 text-right font-semibold tabular-nums">{r.orden}</span>
                <span className="w-24 shrink-0 text-xs">{r.numero ? `Op. ${r.numero}` : 'Movimiento'}</span>
                <span className="min-w-0 flex-1">
                  {r.puntos[0]?.nombre} → {r.puntos[r.puntos.length - 1]?.nombre}
                  <span className="text-xs text-tinta-suave"> · {r.puntos.length} puntos</span>
                  {r.notas && <span className="block text-xs text-alerta">{r.notas}</span>}
                </span>
                {r.estado === 'en_curso' && <span className="rounded-full bg-marca px-2 py-0.5 text-xs font-medium text-white">En curso</span>}
                {r.estado === 'pendiente' && <span className="rounded-full bg-fondo px-2 py-0.5 text-xs text-tinta-suave">Después</span>}
                {r.estado === 'hecha' && (
                  <span className="text-xs">
                    Llegó {r.llegadaEn ? formatearFechaHora(r.llegadaEn, zonaHoraria) : ''} {r.llegadaPor ? `(${POR[r.llegadaPor]})` : ''}
                  </span>
                )}
                {link && (
                  <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-marca hover:underline">
                    <ExternalLink className="size-3.5" /> Maps
                  </a>
                )}
                {puede && r.estado !== 'hecha' && (
                  <span className="flex items-center gap-0.5">
                    <button type="button" onClick={() => setEditando(r)} className="rounded p-1 text-marca hover:bg-hover" title="Editar">
                      <Pencil className="size-3.5" />
                    </button>
                    {i > 0 && lista[i - 1]?.estado !== 'hecha' && (
                      <button type="button" disabled={ocupado} onClick={() => void correr(moverRutaChofer({ choferId: c.choferId, id: r.id, dir: -1 }))} className="rounded p-1 text-tinta-suave hover:bg-hover" title="Subir">
                        <ArrowUp className="size-3.5" />
                      </button>
                    )}
                    {i < lista.length - 1 && (
                      <button type="button" disabled={ocupado} onClick={() => void correr(moverRutaChofer({ choferId: c.choferId, id: r.id, dir: 1 }))} className="rounded p-1 text-tinta-suave hover:bg-hover" title="Bajar">
                        <ArrowDown className="size-3.5" />
                      </button>
                    )}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {lista.length > 0 && !enCurso && <p className="text-xs text-exito">Terminó todas sus rutas.</p>}
      {puede && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <button type="button" onClick={() => setEditando('nueva')} className="inline-flex items-center gap-1 font-medium text-marca hover:underline">
            <Plus className="size-4" /> Agregar ruta
          </button>
          {enCurso && (
            <button type="button" disabled={ocupado} onClick={() => void correr(llegadaRutaChofer({ choferId: c.choferId, llego: true }))} className="inline-flex items-center gap-1 text-xs text-tinta-suave hover:underline" title="Si el GPS no lo detectó y el chofer no avisó">
              <CheckCheck className="size-3.5" /> Llegó al destino de la ruta {enCurso.orden}: pasar a la siguiente
            </button>
          )}
          {hayHechas && (
            <button type="button" disabled={ocupado} onClick={() => void correr(llegadaRutaChofer({ choferId: c.choferId, llego: false }))} className="inline-flex items-center gap-1 text-xs text-tinta-suave hover:underline">
              <Undo2 className="size-3.5" /> Volver a la ruta anterior
            </button>
          )}
        </div>
      )}
      <ErrorBase error={error} />
    </div>
  );
}
