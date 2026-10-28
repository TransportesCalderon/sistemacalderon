'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Ban, CircleAlert, Fuel, LoaderCircle, Lock, Plus, Stamp, Trash2, TriangleAlert, Undo2 } from 'lucide-react';
import { useGensets } from '@/modules/pizarra/queries/hooks';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import type { ErrorAccion } from '@/server/actions/result';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from '@/shared/ui/clases';
import { ETIQUETA_SITUACION_VUELTA, type RegistroGenset, type VueltaGenset } from '../../domain/genset.types';
import { useAnularCierreGenset, useCerrarGenset, useChoferesCombustible, useEliminarRegistroGenset, useFichaGenset, useGensetsCombustible } from '../../queries/hooks';
import { AccionConMotivo, Cargando, Chip, Dato, DiferenciaL, ErrorBase, ErrorLectura, Seccion, type Tono } from '../comun/ui';
import { RegistroGensetForm } from './registro-genset-form';
import { SoloEnPagina, useNombreFicha } from '@/modules/core/fichas/contexto';

const TONO_VUELTA: Record<VueltaGenset['situacion'], Tono> = { en_curso: 'marca', por_cerrar: 'alerta', cerrado: 'exito' };
const L = (v: number | null, dec = 2) => (v === null ? '—' : `${formatearNumero(v, dec)} L`);
const importe = (moneda: string | null, v: number | null) => (v === null ? '—' : `${moneda ?? ''} ${formatearNumero(v, 2)}`.trim());

/**
 * Flota > Gensets > ficha (migración 48): cargas y descargas de combustible con horómetro, vueltas
 * (de un llenado al siguiente, o hasta vaciarlo en la base) y su cierre con el descuento al chofer.
 */
export function GensetFicha({ id }: { id: number }) {
  const { zonaHoraria } = useSesion();
  const { data: gensets } = useGensets();
  const { data: lista } = useGensetsCombustible();
  const { data, isPending, isError, refetch } = useFichaGenset(id);
  const puedeRegistrar = useCan('combustible.cargas:editar');
  const [registrar, setRegistrar] = useState<'carga' | 'descarga' | null>(null);
  const g = gensets?.find((x) => x.id === id);
  const c = lista?.find((x) => x.gensetId === id);
  useNombreFicha(g?.codigo ?? c?.codigo);

  return (
    <div className="space-y-5">
      <SoloEnPagina>
        <Link href="/flota/gensets" className="inline-flex items-center gap-1 text-sm text-tinta-suave hover:text-tinta">
          <ArrowLeft className="size-4" /> Gensets
        </Link>
      </SoloEnPagina>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-tinta-suave">Flota · Genset</p>
          <h1 className="font-mono text-2xl font-semibold text-tinta">{g?.codigo ?? c?.codigo ?? `#${id}`}</h1>
          <p className="text-sm text-tinta-suave">{g?.semiPatente ? `Instalado en el semi ${g.semiPatente}` : 'Sin instalar'}</p>
        </div>
        {puedeRegistrar && !registrar && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={BOTON_PRIMARIO} onClick={() => setRegistrar('carga')}>
              <Fuel className="size-4" /> Registrar carga
            </button>
            <button type="button" className={BOTON_SECUNDARIO} onClick={() => setRegistrar('descarga')}>
              <Plus className="size-4" /> Descarga en la base
            </button>
          </div>
        )}
      </header>

      <Seccion titulo="Datos para el control">
        <dl className="grid gap-4 sm:grid-cols-4">
          <Dato etiqueta="Capacidad del tanque">{L(c?.capacidadL ?? null, 1)}</Dato>
          <Dato etiqueta="Consumo promedio (cargado)">{c?.consumoLh ? `${formatearNumero(c.consumoLh, 2)} L/h` : <span className="text-alerta">Sin cargar</span>}</Dato>
          <Dato etiqueta="Consumo real (últimos cierres)">{c?.consumoRealLh ? `${formatearNumero(c.consumoRealLh, 2)} L/h` : '—'}</Dato>
          <Dato etiqueta="Último horómetro">
            {c?.ultimoHorometroH === null || c?.ultimoHorometroH === undefined ? '—' : `${formatearNumero(c.ultimoHorometroH, 1)} h`}
            {c?.ultimo && <span className="block text-xs text-tinta-suave">{formatearFechaHora(c.ultimo, zonaHoraria)}</span>}
          </Dato>
        </dl>
        <p className="text-xs text-tinta-suave">La capacidad y el consumo promedio se cambian con «Editar» en la lista de gensets.</p>
      </Seccion>

      {registrar && (
        <Seccion titulo={registrar === 'carga' ? 'Registrar una carga' : 'Registrar una descarga en la base'}>
          <RegistroGensetForm gensetInicial={id} tipoInicial={registrar} onListo={() => setRegistrar(null)} onCancelar={() => setRegistrar(null)} />
        </Seccion>
      )}

      {isPending ? (
        <Cargando texto="Cargando el combustible del genset…" />
      ) : isError ? (
        <ErrorLectura texto="No se pudo cargar el combustible del genset." onReintentar={() => refetch()} />
      ) : (
        <>
          <Seccion titulo="Vueltas">
            {data.vueltas.length === 0 ? (
              <p className="text-sm text-tinta-suave">Todavía no hay vueltas: empiezan con una carga a tanque lleno (en Chile), con chofer y horómetro.</p>
            ) : (
              <ul className="space-y-3">
                {data.vueltas.map((v) => (
                  <Vuelta key={v.inicioId} v={v} gensetId={id} />
                ))}
              </ul>
            )}
          </Seccion>
          <Seccion titulo="Cargas y descargas">
            {data.registros.length === 0 ? (
              <p className="text-sm text-tinta-suave">Sin registros.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead className="border-b border-borde text-left text-xs tracking-wide text-tinta-suave uppercase">
                    <tr>
                      <th className="px-2 py-2">Fecha y hora</th>
                      <th className="px-2 py-2">Qué</th>
                      <th className="px-2 py-2 text-right">Litros</th>
                      <th className="px-2 py-2 text-right">Horómetro</th>
                      <th className="px-2 py-2">Chofer</th>
                      <th className="px-2 py-2">Dónde</th>
                      <th className="px-2 py-2 text-right">Importe</th>
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borde">
                    {data.registros.map((r) => (
                      <FilaRegistro key={r.id} r={r} gensetId={id} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Seccion>
          {data.cierres.some((x) => x.estado === 'anulado') && (
            <Seccion titulo="Cierres anulados">
              <ul className="space-y-1 text-sm">
                {data.cierres
                  .filter((x) => x.estado === 'anulado')
                  .map((x) => (
                    <li key={x.id} className="text-tinta-suave">
                      <span className="font-mono">{x.numero}</span> · {formatearFechaHora(x.inicio, zonaHoraria)} → {formatearFechaHora(x.fin, zonaHoraria)} · {x.motivoAnulacion}
                    </li>
                  ))}
              </ul>
            </Seccion>
          )}
        </>
      )}
    </div>
  );
}

function FilaRegistro({ r, gensetId }: { r: RegistroGenset; gensetId: number }) {
  const { zonaHoraria } = useSesion();
  const puede = useCan('combustible.cargas:editar');
  const eliminar = useEliminarRegistroGenset();
  const [error, setError] = useState<ErrorAccion | null>(null);
  return (
    <>
      <tr className="align-top">
        <td className="px-2 py-2 whitespace-nowrap">{formatearFechaHora(r.fechaHora, zonaHoraria)}</td>
        <td className="px-2 py-2">
          {r.tipo === 'carga' ? 'Carga' : 'Descarga'}
          {r.tanqueLleno && (
            <span className="ml-1">
              <Chip tono="marca">Lleno</Chip>
            </span>
          )}
          {r.vacio && (
            <span className="ml-1">
              <Chip tono="neutro">Quedó vacío</Chip>
            </span>
          )}
        </td>
        <td className="px-2 py-2 text-right tabular-nums">{formatearNumero(r.litros, 2)}</td>
        <td className="px-2 py-2 text-right tabular-nums">{formatearNumero(r.horometroH, 1)} h</td>
        <td className="px-2 py-2">{r.chofer ?? '—'}</td>
        <td className="px-2 py-2 text-tinta-suave">
          {r.tipo === 'carga' ? r.estacion : r.deposito}
          {r.semi && <span className="block text-xs">Semi {r.semi}{r.tractor ? ` · tractor ${r.tractor}` : ''}</span>}
          {r.ticketNumero && <span className="block text-xs">Ticket {r.ticketNumero}</span>}
        </td>
        <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums">{importe(r.moneda, r.importe)}</td>
        <td className="px-2 py-2 text-right">
          {r.cerrado ? (
            <span className="inline-flex items-center gap-1 text-xs text-tinta-suave" title={`En el cierre ${r.cerrado}`}>
              <Lock className="size-3.5" /> {r.cerrado}
            </span>
          ) : (
            puede && (
              <AccionConMotivo
                etiqueta="Eliminar"
                icono={<Trash2 className="size-3.5" />}
                titulo="Eliminar el registro"
                explicacion={r.tipo === 'descarga' ? 'También se revierte la entrada al tanque de base.' : undefined}
                ocupado={eliminar.isPending}
                error={error}
                onConfirmar={async (motivo) => {
                  setError(null);
                  const x = await eliminar.mutateAsync({ registroId: r.id, gensetId, motivo });
                  if (!x.ok) setError(x.error);
                  return x.ok;
                }}
              />
            )
          )}
        </td>
      </tr>
    </>
  );
}

function Vuelta({ v, gensetId }: { v: VueltaGenset; gensetId: number }) {
  const { zonaHoraria } = useSesion();
  const puedeCerrar = useCan('combustible.cierre_viaje:transicionar');
  const anular = useAnularCierreGenset();
  const [error, setError] = useState<ErrorAccion | null>(null);
  const finTexto = v.fin
    ? `${formatearFechaHora(v.fin.fechaHora, zonaHoraria)} · ${v.fin.tipo === 'carga' ? 'llenado' : 'vaciado en la base'}`
    : 'sigue: hasta el próximo llenado o hasta vaciarlo';
  return (
    <li className={cn('space-y-3 rounded-lg border p-4', v.situacion === 'por_cerrar' ? 'border-alerta/40' : 'border-borde')}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Chip tono={TONO_VUELTA[v.situacion]}>{ETIQUETA_SITUACION_VUELTA[v.situacion]}</Chip>
        <span className="font-medium text-tinta">{formatearFechaHora(v.inicio.fechaHora, zonaHoraria)}</span>
        <span className="text-tinta-suave">→ {finTexto}</span>
        <span className="text-tinta-suave">· Lo llenó {v.inicio.chofer ?? '—'}</span>
        {v.cierre && <span className="ml-auto font-mono text-xs text-tinta-suave">{v.cierre.numero}</span>}
      </div>
      {v.fin && (
        <dl className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Dato etiqueta="Horas (horómetro)">{v.horas === null ? '—' : `${formatearNumero(v.horas, 1)} h`}</Dato>
          <Dato etiqueta="Cargado después">{L(v.cargadoL)}</Dato>
          <Dato etiqueta="Descargado">{L(v.descargadoL)}</Dato>
          <Dato etiqueta="Consumo real" destacado>
            {L(v.consumoRealL)}
            {v.consumoRealLh !== null && <span className="block text-xs font-normal text-tinta-suave">{formatearNumero(v.consumoRealLh, 2)} L/h</span>}
          </Dato>
          <Dato etiqueta="Esperado" destacado>
            {L(v.consumoEsperadoL)}
            {v.consumoLh !== null && <span className="block text-xs font-normal text-tinta-suave">{formatearNumero(v.consumoLh, 2)} L/h</span>}
          </Dato>
          <Dato etiqueta="Diferencia" destacado>
            <DiferenciaL litros={v.diferenciaL} toleranciaL={v.toleranciaL} />
            <span className="block text-xs font-normal text-tinta-suave">tolerancia ± {formatearNumero(v.toleranciaL, 0)} L</span>
          </Dato>
        </dl>
      )}
      {v.situacion !== 'cerrado' && v.pendientes.length > 0 && v.fin && (
        <ul className="space-y-0.5 text-sm text-alerta">
          {v.pendientes.map((p) => (
            <li key={p} className="flex items-start gap-1.5">
              <CircleAlert className="mt-0.5 size-4 shrink-0" /> {p}
            </li>
          ))}
        </ul>
      )}
      {v.avisos.length > 0 && (
        <ul className="space-y-0.5 text-sm text-alerta">
          {v.avisos.map((a) => (
            <li key={a} className="flex items-start gap-1.5">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {a}
            </li>
          ))}
        </ul>
      )}
      {v.cierre ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-borde pt-3 text-sm">
          <span>
            Responsable: <span className="font-medium">{v.cierre.choferResponsable}</span>
          </span>
          <span>
            Descuento: <span className={cn('font-medium', v.cierre.descuentoL > 0 && 'text-error')}>{L(v.cierre.descuentoL)}</span>
            {v.cierre.descuentoImporte !== null && v.cierre.descuentoL > 0 && ` · ${importe(v.moneda, v.cierre.descuentoImporte)}`}
          </span>
          {puedeCerrar && (
            <span className="ml-auto">
              <AccionConMotivo
                etiqueta="Anular cierre"
                icono={<Undo2 className="size-4" />}
                titulo={`Anular el cierre ${v.cierre.numero}`}
                explicacion="La vuelta vuelve a quedar para cerrar y se pueden corregir sus registros."
                ocupado={anular.isPending}
                error={error}
                onConfirmar={async (motivo) => {
                  setError(null);
                  const x = await anular.mutateAsync({ cierreId: v.cierre!.id, gensetId, motivo });
                  if (!x.ok) setError(x.error);
                  return x.ok;
                }}
              />
            </span>
          )}
        </div>
      ) : (
        v.situacion === 'por_cerrar' && puedeCerrar && <CerrarVuelta v={v} gensetId={gensetId} />
      )}
    </li>
  );
}

function CerrarVuelta({ v, gensetId }: { v: VueltaGenset; gensetId: number }) {
  const cerrar = useCerrarGenset();
  const { data: choferes } = useChoferesCombustible();
  const [chofer, setChofer] = useState(v.choferPropuestoId ? String(v.choferPropuestoId) : '');
  const [motivo, setMotivo] = useState('');
  const [ok, setOk] = useState(false);
  const [observacion, setObservacion] = useState('');
  const [error, setError] = useState<ErrorAccion | null>(null);
  const cambio = chofer !== '' && chofer !== String(v.choferPropuestoId ?? '');
  return (
    <form
      className="space-y-3 border-t border-borde pt-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        const r = await cerrar.mutateAsync({ inicioId: v.inicioId, gensetId, choferId: chofer, motivoChofer: motivo, okTolerancia: ok, observacion });
        if (!r.ok) setError(r.error);
      }}
    >
      <p className="text-sm">
        {v.descuentoL > 0 ? (
          <span className="font-medium text-error">
            Se descuentan {L(v.descuentoL)}
            {v.descuentoImporte !== null && ` (${importe(v.moneda, v.descuentoImporte)} a ${formatearNumero(v.precioLitro ?? 0, 2)} el litro)`} al responsable.
          </span>
        ) : (
          <span className="text-tinta-suave">No hay descuento.</span>
        )}
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-sm">
          <span className="block font-medium text-tinta">Responsable</span>
          <select value={chofer} onChange={(e) => setChofer(e.target.value)} className="h-9 w-full rounded-md border border-borde bg-panel px-2">
            {choferes?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
                {c.id === v.choferPropuestoId ? ' (lo llenó)' : ''}
              </option>
            ))}
          </select>
        </label>
        {cambio && (
          <label className="space-y-1 text-sm">
            <span className="block font-medium text-tinta">Por qué es otro chofer *</span>
            <input value={motivo} maxLength={500} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: relevo en Mendoza" className="h-9 w-full rounded-md border border-borde bg-panel px-2" />
          </label>
        )}
        <label className="space-y-1 text-sm">
          <span className="block font-medium text-tinta">Observación</span>
          <input value={observacion} maxLength={1000} onChange={(e) => setObservacion(e.target.value)} className="h-9 w-full rounded-md border border-borde bg-panel px-2" />
        </label>
      </div>
      {v.dentroTolerancia && (
        <label className="flex items-start gap-2 rounded-lg bg-alerta-suave p-3 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 accent-marca" checked={ok} onChange={(e) => setOk(e.target.checked)} />
          <span>
            Faltan <span className="font-medium">{L(v.diferenciaL)}</span>, dentro de la tolerancia de {formatearNumero(v.toleranciaL, 0)} L. Confirmo que{' '}
            <span className="font-medium">no se le descuentan</span> al chofer.
          </span>
        </label>
      )}
      <ErrorBase error={error} />
      <button type="submit" className={BOTON_PRIMARIO} disabled={cerrar.isPending}>
        {cerrar.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Stamp className="size-4" />} Cerrar la vuelta
      </button>
      <span className="ml-3 text-xs text-tinta-suave">
        <Ban className="mr-1 inline size-3.5" />
        Una vez cerrada, sus registros no se cambian (se puede anular el cierre).
      </span>
    </form>
  );
}
