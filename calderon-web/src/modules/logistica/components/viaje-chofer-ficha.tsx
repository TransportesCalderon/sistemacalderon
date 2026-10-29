'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, Ban, Calculator, ChevronDown, CircleAlert, Flag, Fuel, LoaderCircle, Lock, Pencil, Plus, RotateCcw, Stamp, Trash2, TriangleAlert } from 'lucide-react';
import { BorradorForm } from '@/modules/combustible/components/cierres/borrador-form';
import { AccionConMotivo, Cargando, Chip, DiferenciaL, ErrorBase, ErrorLectura, Seccion } from '@/modules/combustible/components/comun/ui';
import { useCierre, useMonedas, useResultadoCierre } from '@/modules/combustible/queries/hooks';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import type { ErrorAccion } from '@/server/actions/result';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from '@/shared/ui/clases';
import type { CierreViajeId } from '@/shared/types/dominio';
import type { CargaDelViaje, ItemViaje, ViajeChofer } from '../domain/viaje-chofer.types';
import {
  useAgregarItemViaje,
  useContinuarOperacionViaje,
  useAjustarItemViaje,
  useAnularViajeChofer,
  useCambiarChoferViaje,
  useCerrarViajeChofer,
  useCerrarYAprobarViaje,
  useOpcionesViaje,
  usePrepararCierreCombustible,
  useQuitarItemViaje,
  useReabrirViajeChofer,
  useViajeChofer,
} from '../queries/hooks';
import { CostosViaje } from './costos-viaje';
import { Lista } from './viajes-pantalla';
import { SelectorItems, SituacionViajeChoferChip, formatoImporte, formatoNumero, type ItemElegido } from './viaje-chofer-comun';
import { SoloEnPagina, useNombreFicha } from '@/modules/core/fichas/contexto';
import { NombreEnlazado } from '@/shared/ui/nombre-enlazado';

type Resultado = { ok: true } | { ok: false; error: ErrorAccion };

/**
 * Ficha y cierre del viaje de chofer (migración 46), parecida a la planilla de cierre:
 * recorrido (cargas), combustible, operaciones con canon y km, y cerrar.
 * Los números y lo que falta los da la base.
 */
export function ViajeChoferFicha({ id }: { id: number }) {
  const { data: v, isPending, isError, refetch } = useViajeChofer(id);
  useNombreFicha(v ? `${v.numero} · ${v.camion.patente}` : null);
  if (isPending) return <Cargando texto="Cargando el viaje…" />;
  if (isError || !v) return <ErrorLectura texto="No se pudo cargar el viaje." onReintentar={() => refetch()} />;
  const abierto = v.estado === 'abierto';

  return (
    <div className="space-y-5">
      <SoloEnPagina>
        <Link href="/operacion/viajes-chofer" className="inline-flex items-center gap-1 text-sm text-tinta-suave hover:text-tinta">
          <ArrowLeft className="size-4" /> Viajes de chofer
        </Link>
      </SoloEnPagina>
      <Cabecera v={v} />
      {abierto && v.pendientes.length > 0 && (
        <section role="status" className="space-y-1 rounded-xl border border-alerta/30 bg-alerta-suave p-4 text-sm">
          <h2 className="flex items-center gap-2 font-medium text-alerta">
            <CircleAlert className="size-4" /> Para cerrar el viaje falta
          </h2>
          <ul className="list-disc space-y-0.5 pl-5">
            {v.pendientes.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>
      )}
      {v.estado === 'anulado' && <p className="rounded-lg bg-fondo p-3 text-sm text-tinta-suave">Viaje anulado: {v.motivoAnulacion}</p>}
      <Recorrido v={v} />
      <Combustible v={v} />
      <Operaciones v={v} />
      {v.estado !== 'anulado' && <CostosViaje viaje={v} />}
      <Acciones v={v} />
    </div>
  );
}

function Cabecera({ v }: { v: ViajeChofer }) {
  const { zonaHoraria } = useSesion();
  const puede = useCan('operacion.tramos:editar');
  const [cambiar, setCambiar] = useState(false);
  return (
    <header className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-tinta">
          Viaje <span className="font-mono">{v.numero}</span>
        </h1>
        <SituacionViajeChoferChip s={v.situacion} />
        {v.cerradoEn && (
          <span className="text-sm text-tinta-suave">
            Cerrado el {formatearFechaHora(v.cerradoEn, zonaHoraria)}
            {v.cerradoPor === null && ' · automáticamente'}
          </span>
        )}
      </div>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-tinta">
        <span>
          Tractor <span className="font-mono font-semibold">{v.camion.patente}</span>
          <span className="text-tinta-suave"> · {v.camion.codigoInterno}</span>
        </span>
        <span>
          Chofer <span className="font-semibold">{v.chofer.nombre}</span>
          {puede && v.estado === 'abierto' && !cambiar && (
            <button type="button" className="ml-2 text-xs text-marca hover:underline" onClick={() => setCambiar(true)}>
              Cambiar
            </button>
          )}
        </span>
        {v.observacion && <span className="text-tinta-suave">{v.observacion}</span>}
      </p>
      {cambiar && <CambiarChofer v={v} onCerrar={() => setCambiar(false)} />}
    </header>
  );
}

function CambiarChofer({ v, onCerrar }: { v: ViajeChofer; onCerrar: () => void }) {
  const cambiar = useCambiarChoferViaje();
  const { data: op } = useOpcionesViaje();
  const [chofer, setChofer] = useState(String(v.chofer.id));
  const [error, setError] = useState<ErrorAccion | null>(null);
  return (
    <div className="flex max-w-xl flex-wrap items-center gap-2 rounded-lg border border-borde p-3 text-sm">
      <span className="text-tinta-suave">Si el semi pasó a otro tractor, eso es un relevo: iniciá el viaje del otro tractor. Esto es solo si cambió el chofer de este tractor.</span>
      <Lista valor={chofer} opciones={op?.choferes} onCambiar={setChofer} className="h-9 rounded-md border border-borde bg-panel px-2" aria-label="Chofer" />
      <button
        type="button"
        className={BOTON_PRIMARIO}
        disabled={cambiar.isPending}
        onClick={async () => {
          setError(null);
          const r = await cambiar.mutateAsync({ viajeId: v.id, choferId: chofer });
          if (r.ok) onCerrar();
          else setError(r.error);
        }}
      >
        Guardar
      </button>
      <button type="button" className={BOTON_SECUNDARIO} onClick={onCerrar}>
        Cancelar
      </button>
      <div className="w-full">
        <ErrorBase error={error} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ recorrido
const MOMENTO: Record<CargaDelViaje['momento'], { etiqueta: string; clase: string }> = {
  salida: { etiqueta: 'Salida', clase: 'bg-marca text-white' },
  viaje: { etiqueta: 'En viaje', clase: 'bg-fondo text-tinta' },
  llegada: { etiqueta: 'Llegada', clase: 'bg-exito text-white' },
};

function Recorrido({ v }: { v: ViajeChofer }) {
  const { zonaHoraria } = useSesion();
  const enViaje = v.cargas.filter((c) => c.momento === 'viaje' && !c.equipoFrio).reduce((s, c) => s + c.litros, 0);
  const llegada = v.cargas.find((c) => c.momento === 'llegada');
  return (
    <Seccion titulo="Recorrido: cargas de combustible">
      <ol className="relative space-y-3 border-l-2 border-borde pl-5">
        {v.cargas.map((c) => (
          <li key={c.id} className="relative">
            <span className={cn('absolute top-1.5 -left-[27px] size-3 rounded-full border-2 border-panel', c.momento === 'viaje' ? 'bg-borde' : c.momento === 'salida' ? 'bg-marca' : 'bg-exito')} />
            <NombreEnlazado tipo="carga" id={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-1 text-sm hover:bg-hover">
              <span className={cn('rounded px-1.5 py-0.5 text-xs font-medium', MOMENTO[c.momento].clase)}>{MOMENTO[c.momento].etiqueta}</span>
              <span className="whitespace-nowrap">{formatearFechaHora(c.fechaHora, zonaHoraria)}</span>
              <span className="text-tinta-suave">{c.estacion ?? 'Sin estación'}</span>
              <span className="font-semibold tabular-nums">{formatoNumero(c.litros, 2)} L</span>
              {c.tanqueLleno && <Chip tono="marca">Tanque lleno</Chip>}
              {c.equipoFrio && <Chip tono="neutro">Equipo de frío</Chip>}
              {c.odometroKm !== null && <span className="text-xs text-tinta-suave">{formatoNumero(c.odometroKm)} km</span>}
            </NombreEnlazado>
          </li>
        ))}
        {!llegada && v.estado === 'abierto' && (
          <li className="relative text-sm text-tinta-suave">
            <span className="absolute top-1.5 -left-[27px] size-3 rounded-full border-2 border-dashed border-tinta-suave bg-panel" />
            <span className="px-2">El viaje termina con la próxima carga a tanque lleno (corte de viaje) del tractor.</span>
          </li>
        )}
      </ol>
      <dl className="grid gap-4 border-t border-borde pt-3 sm:grid-cols-3">
        <Dato etiqueta="Cargado en el viaje">{formatoNumero(enViaje, 2)} L</Dato>
        <Dato etiqueta="Carga de llegada">{llegada ? `${formatoNumero(llegada.litros, 2)} L` : '—'}</Dato>
        <Dato etiqueta="Total cargado al cierre" fuerte>
          {llegada ? `${formatoNumero(enViaje + llegada.litros, 2)} L` : '—'}
        </Dato>
      </dl>
    </Seccion>
  );
}

function Dato({ etiqueta, children, fuerte }: { etiqueta: string; children: ReactNode; fuerte?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-tinta-suave">{etiqueta}</dt>
      <dd className={cn('tabular-nums', fuerte ? 'text-lg font-semibold text-tinta' : 'text-tinta')}>{children}</dd>
    </div>
  );
}

// ---------------------------------------------------------------- combustible
function Combustible({ v }: { v: ViajeChofer }) {
  const preparar = usePrepararCierreCombustible();
  const puede = useCan('operacion.tramos:editar');
  const [error, setError] = useState<ErrorAccion | null>(null);
  if (v.cierre) return <CombustibleCalculado cierreId={v.cierre.id as CierreViajeId} />;
  return (
    <Seccion titulo="Combustible del viaje">
      {v.situacion === 'en_viaje' ? (
        <p className="text-sm text-tinta-suave">Se calcula cuando el tractor carga a tanque lleno al llegar.</p>
      ) : v.estado === 'anulado' ? (
        <p className="text-sm text-tinta-suave">—</p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-tinta-suave">El tractor ya cargó a tanque lleno: el combustible se calcula solo en unos minutos. Si no aparece, tocá Calcular.</p>
          {puede && (
            <button
              type="button"
              className={BOTON_PRIMARIO}
              disabled={preparar.isPending}
              onClick={async () => {
                setError(null);
                const r = await preparar.mutateAsync({ viajeId: v.id });
                if (!r.ok) setError(r.error);
              }}
            >
              {preparar.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Calculator className="size-4" />} Calcular el combustible
            </button>
          )}
          <ErrorBase error={error} />
        </div>
      )}
    </Seccion>
  );
}

function CombustibleCalculado({ cierreId }: { cierreId: CierreViajeId }) {
  const { data: cierre, isPending } = useCierre(cierreId);
  const esBorrador = cierre?.estado === 'borrador';
  const vivo = useResultadoCierre(cierreId, esBorrador);
  const [completar, setCompletar] = useState(false);
  const puedeCompletar = useCan('combustible.cierre_viaje:editar');
  const resultado = esBorrador ? (vivo.data ?? null) : (cierre?.congelado ?? null);
  const c = resultado?.camion;

  return (
    <Seccion
      titulo="Combustible del viaje"
      acciones={
        cierre && (
          <NombreEnlazado tipo="cierre" id={cierre.id} className="text-sm text-marca hover:underline">
            Cierre {cierre.numero} ({cierre.estado === 'aprobado' ? 'aprobado' : cierre.estado === 'borrador' ? 'falta aprobar' : cierre.estado}) →
          </NombreEnlazado>
        )
      }
    >
      {isPending || (esBorrador && vivo.isPending) ? (
        <Cargando texto="Calculando…" />
      ) : esBorrador && vivo.isError ? (
        <ErrorBase error={{ codigo: 'regla_negocio', mensaje: vivo.error.message }} />
      ) : !c ? (
        <p className="text-sm text-tinta-suave">Sin resultado.</p>
      ) : (
        <>
          <dl className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <Dato etiqueta="Cargado (libro)" fuerte>
              {formatoNumero(c.libroL, 2)} L
            </Dato>
            <Dato etiqueta="Plataforma" fuerte>
              {formatoNumero(c.consumoPlataformaL, 2)} L
            </Dato>
            <Dato etiqueta="Diferencia" fuerte>
              <DiferenciaL litros={c.diferenciaL} toleranciaL={c.toleranciaL} />
            </Dato>
            <Dato etiqueta="Km recorridos">{formatoNumero(c.kmRecorridos)}</Dato>
            <Dato etiqueta="Consumo">{c.consumoL100km === null ? '—' : `${formatoNumero(c.consumoL100km, 1)} L/100 km`}</Dato>
            <Dato etiqueta="Ralentí / días parado">
              {formatoNumero(c.horasRalenti, 1)} h / {formatoNumero(c.diasParado)}
            </Dato>
          </dl>
          {c.toleranciaL !== null && <p className="text-xs text-tinta-suave">Tolerancia ± {formatoNumero(c.toleranciaL, 2)} L. Imputable al chofer: {formatoNumero(resultado?.imputableTotalL ?? null, 2)} L.</p>}
          {esBorrador && resultado && resultado.pendientes.length > 0 && (
            <ul className="list-disc space-y-0.5 rounded-lg bg-alerta-suave p-3 pl-8 text-sm text-alerta">
              {resultado.pendientes.map((p) => (
                <li key={p.codigo + p.mensaje}>{p.mensaje}</li>
              ))}
            </ul>
          )}
          {resultado && resultado.avisos.length > 0 && (
            <ul className="space-y-0.5 text-sm text-alerta">
              {resultado.avisos.map((a) => (
                <li key={a} className="flex items-start gap-1.5">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {a}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {cierre && esBorrador && puedeCompletar && (
        <div className="border-t border-borde pt-3">
          <button type="button" className="inline-flex items-center gap-1 text-sm font-medium text-marca" onClick={() => setCompletar(!completar)} aria-expanded={completar}>
            <ChevronDown className={cn('size-4 transition-transform', completar && 'rotate-180')} /> Completar el cierre: programador, test de alcohol, litros justificados y observaciones
          </button>
          {completar && (
            <div className="mt-3">
              <BorradorForm cierre={cierre} />
            </div>
          )}
        </div>
      )}
    </Seccion>
  );
}

// ---------------------------------------------------------------- operaciones
function Operaciones({ v }: { v: ViajeChofer }) {
  const puede = useCan('operacion.tramos:editar') && v.estado === 'abierto';
  const [agregar, setAgregar] = useState(false);
  const [editando, setEditando] = useState<number | null>(null);
  return (
    <Seccion
      titulo="Operaciones y pago al chofer"
      acciones={
        puede &&
        !agregar && (
          <button type="button" className={BOTON_SECUNDARIO} onClick={() => setAgregar(true)}>
            <Plus className="size-4" /> Agregar
          </button>
        )
      }
    >
      {agregar && <Agregar v={v} onCerrar={() => setAgregar(false)} />}
      {v.items.length === 0 ? (
        <p className="text-sm text-tinta-suave">Todavía no se cargó qué hizo el chofer en este viaje.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-borde text-left text-xs tracking-wide text-tinta-suave uppercase">
              <tr>
                <th className="px-2 py-2">Operación</th>
                <th className="px-2 py-2">Línea</th>
                <th className="px-2 py-2 text-right">Canon</th>
                <th className="px-2 py-2 text-right">Km</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {v.items.map((i) => (
                <FilaItem key={i.id} i={i} puede={puede} editando={editando === i.id} onEditar={(e) => setEditando(e ? i.id : null)} />
              ))}
            </tbody>
            <tfoot className="border-t-2 border-borde font-semibold">
              <tr>
                <td className="px-2 py-2" colSpan={2}>
                  Total del viaje
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {v.canonTotal.length === 0 ? '—' : v.canonTotal.map((c) => formatoImporte(c.moneda, c.total)).join(' + ')}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{formatoNumero(v.kmTotal)} km</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="text-xs text-tinta-suave">
        El canon y los km salen de la línea (Más › Ajustes › Líneas). Al cerrar el viaje quedan fijos para la liquidación; el precio por km lo aplica la
        liquidación.
      </p>
    </Seccion>
  );
}

function FilaItem({ i, puede, editando, onEditar }: { i: ItemViaje; puede: boolean; editando: boolean; onEditar: (e: boolean) => void }) {
  const quitar = useQuitarItemViaje();
  const continuar = useContinuarOperacionViaje();
  const [error, setError] = useState<ErrorAccion | null>(null);
  return (
    <>
      <tr className="align-top">
        <td className="px-2 py-2">
          {i.servicioId ? (
            <>
              <NombreEnlazado
                tipo="operacion"
                id={i.servicioId}
                alternativa={`/operacion/operaciones?op=${i.numeroOperacion}`}
                className="font-mono font-semibold text-marca hover:underline"
              >
                N° {i.numeroOperacion}
              </NombreEnlazado>{' '}
              · {i.cliente}
              {i.contenedor && <span className="font-mono text-tinta-suave"> · {i.contenedor}</span>}
            </>
          ) : (
            <span className="text-tinta-suave">Vuelta vacía</span>
          )}
          {i.relevo.length > 0 && (
            <span className="mt-1 flex flex-wrap gap-1">
              {i.relevo.map((r) => (
                <NombreEnlazado tipo="viaje" id={r.viajeId} key={r.viajeId} title="Esta operación está también en otro viaje: revisá que cada chofer tenga su tramo">
                  <Chip tono="alerta">
                    Relevo con {r.numero} · {r.chofer}
                  </Chip>
                </NombreEnlazado>
              ))}
            </span>
          )}
          {i.contenedorVacio && (
            <span className="mt-1 block">
              <Chip tono="alerta">{i.motivoAjuste ? 'Contenedor vacío' : 'Contenedor vacío: ajustá el canon'}</Chip>
            </span>
          )}
          {i.motivoAjuste && <span className="mt-1 block text-xs text-tinta-suave">Ajustado: {i.motivoAjuste}</span>}
          {/* Migración 109: la misma operación sigue con este chofer hasta su destino */}
          {puede && i.siguiente && (
            <button
              type="button"
              disabled={continuar.isPending}
              title={i.siguiente.linea ? `Agrega el tramo ${i.siguiente.linea} a la misma operación` : `Falta la línea de ${i.siguiente.desde} a ${i.siguiente.hasta}`}
              onClick={async () => {
                setError(null);
                const r = await continuar.mutateAsync({ itemId: i.id });
                if (!r.ok) setError(r.error);
              }}
              className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-marca px-2 py-0.5 text-xs font-medium text-marca hover:bg-marca-suave disabled:opacity-60"
            >
              {continuar.isPending ? <LoaderCircle className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              Continúa a {i.siguiente.hasta}
              {i.siguiente.linea && <span className="font-mono text-tinta-suave">({i.siguiente.linea})</span>}
            </button>
          )}
        </td>
        <td className="px-2 py-2 font-mono">{i.linea}</td>
        <td className={cn('px-2 py-2 text-right whitespace-nowrap tabular-nums', i.canon === null && 'text-alerta')}>
          {i.canon === null ? 'Falta' : formatoImporte(i.canonMoneda, i.canon)}
        </td>
        <td className={cn('px-2 py-2 text-right tabular-nums', i.km === null && 'text-alerta')}>{i.km === null ? 'Falta' : formatoNumero(i.km)}</td>
        <td className="px-2 py-2 text-right whitespace-nowrap">
          {puede && !editando && (
            <>
              <button type="button" className="mr-3 inline-flex items-center gap-1 text-xs text-marca hover:underline" onClick={() => onEditar(true)}>
                <Pencil className="size-3.5" /> Ajustar
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs text-marca hover:underline"
                disabled={quitar.isPending}
                onClick={async () => {
                  setError(null);
                  const r = await quitar.mutateAsync({ itemId: i.id });
                  if (!r.ok) setError(r.error);
                }}
              >
                <Trash2 className="size-3.5" /> Quitar
              </button>
            </>
          )}
        </td>
      </tr>
      {(editando || error) && (
        <tr>
          <td colSpan={5} className="px-2 pb-3">
            <ErrorBase error={error} />
            {editando && <Ajustar i={i} onCerrar={() => onEditar(false)} />}
          </td>
        </tr>
      )}
    </>
  );
}

function Ajustar({ i, onCerrar }: { i: ItemViaje; onCerrar: () => void }) {
  const ajustar = useAjustarItemViaje();
  const { data: monedas } = useMonedas();
  const txt = (n: number | null) => (n === null ? '' : String(n).replace('.', ','));
  const [canon, setCanon] = useState(txt(i.canon));
  const [moneda, setMoneda] = useState(i.canonMoneda ?? i.canonMonedaLinea ?? 'ARS');
  const [km, setKm] = useState(txt(i.km));
  const [motivo, setMotivo] = useState(i.motivoAjuste ?? '');
  const [error, setError] = useState<ErrorAccion | null>(null);
  const deLinea = `De la línea: ${i.canonLinea === null ? 'sin canon' : formatoImporte(i.canonMonedaLinea, i.canonLinea)} · ${i.kmLinea === null ? 'sin km' : `${formatoNumero(i.kmLinea)} km`}`;
  return (
    <form
      className="grid gap-3 rounded-lg border border-borde bg-fondo/40 p-3 text-sm sm:grid-cols-[auto_1fr_1fr_2fr]"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        const r = await ajustar.mutateAsync({ itemId: i.id, canon, moneda, km, motivo });
        if (r.ok) onCerrar();
        else setError(r.error);
      }}
    >
      <label className="space-y-1">
        <span className="block text-xs text-tinta-suave">Moneda</span>
        <select value={moneda} onChange={(e) => setMoneda(e.target.value)} className="h-9 rounded-md border border-borde bg-panel px-2">
          {(monedas ?? [{ codigo: 'ARS', nombre: 'ARS' }]).map((m) => (
            <option key={m.codigo} value={m.codigo}>
              {m.codigo}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1">
        <span className="block text-xs text-tinta-suave">Canon</span>
        <input inputMode="decimal" value={canon} onChange={(e) => setCanon(e.target.value)} className="h-9 w-full rounded-md border border-borde bg-panel px-2" />
      </label>
      <label className="space-y-1">
        <span className="block text-xs text-tinta-suave">Km</span>
        <input inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} className="h-9 w-full rounded-md border border-borde bg-panel px-2" />
      </label>
      <label className="space-y-1">
        <span className="block text-xs text-tinta-suave">Motivo (si no es lo de la línea)</span>
        <input value={motivo} maxLength={500} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: relevo en Mendoza" className="h-9 w-full rounded-md border border-borde bg-panel px-2" />
      </label>
      <p className="text-xs text-tinta-suave sm:col-span-4">{deLinea}</p>
      <div className="sm:col-span-4">
        <ErrorBase error={error} />
      </div>
      <div className="flex gap-2 sm:col-span-4">
        <button type="submit" className={BOTON_PRIMARIO} disabled={ajustar.isPending}>
          {ajustar.isPending && <LoaderCircle className="size-4 animate-spin" />} Guardar
        </button>
        <button type="button" className={BOTON_SECUNDARIO} onClick={onCerrar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function Agregar({ v, onCerrar }: { v: ViajeChofer; onCerrar: () => void }) {
  const agregar = useAgregarItemViaje();
  const [items, setItems] = useState<ItemElegido[]>([]);
  const [error, setError] = useState<ErrorAccion | null>(null);
  // Migración 109: una operación que ya está se puede volver a agregar con otro tramo (otra línea)
  return (
    <div className="space-y-3 rounded-lg border border-borde bg-fondo/40 p-4">
      <p className="text-xs text-tinta-suave">
        Para agregar otro tramo de una operación que ya está en el viaje, elegila de nuevo y marcá el tramo (por ejemplo MZA-BSAS). O usá «Continúa a…» en
        la operación.
      </p>
      <SelectorItems camionId={v.camion.id} elegidos={items} onCambiar={setItems} />
      <ErrorBase error={error} />
      <div className="flex gap-2">
        <button
          type="button"
          className={BOTON_PRIMARIO}
          disabled={agregar.isPending || items.length === 0}
          onClick={async () => {
            setError(null);
            // Uno por uno: si alguno falla, se muestra el mensaje de la base y quedan los que faltan.
            let pendientes = items;
            for (const it of items) {
              const r = await agregar.mutateAsync({ viajeId: v.id, servicioId: it.servicioId, lineaId: it.lineaId });
              if (!r.ok) {
                setError(r.error);
                setItems(pendientes);
                return;
              }
              pendientes = pendientes.filter((x) => x !== it);
            }
            onCerrar();
          }}
        >
          {agregar.isPending && <LoaderCircle className="size-4 animate-spin" />} Agregar {items.length > 0 ? items.length : ''}
        </button>
        <button type="button" className={BOTON_SECUNDARIO} onClick={onCerrar}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- acciones
function Acciones({ v }: { v: ViajeChofer }) {
  const puede = useCan('operacion.tramos:transicionar');
  const puedeAprobar = useCan('combustible.cierre_viaje:transicionar');
  const cerrarYAprobar = useCerrarYAprobarViaje();
  const combustiblePorAprobar = v.cierre !== null && v.cierre.estado === 'borrador';
  // Migración 82: si al viaje del chofer le faltan operaciones, canon o km, el combustible se aprueba igual y el viaje queda abierto
  const faltaViaje = v.estado === 'abierto' && v.pendientes.some((p) => !p.startsWith('Falta la carga a tanque lleno'));
  const cierraViaje = v.estado === 'abierto' && !faltaViaje;
  const cerrar = useCerrarViajeChofer();
  const reabrir = useReabrirViajeChofer();
  const anular = useAnularViajeChofer();
  const [error, setError] = useState<ErrorAccion | null>(null);
  if ((!puede && !puedeAprobar) || v.estado === 'anulado') return null;
  const ejecutar = async (p: Promise<Resultado>) => {
    setError(null);
    const r = await p;
    if (!r.ok) setError(r.error);
    return r.ok;
  };
  return (
    <Seccion titulo="Cerrar el viaje">
      {v.estado === 'abierto' ? (
        <p className="text-sm text-tinta-suave">
          Al cerrar quedan fijos el canon y los km para la liquidación del chofer. Con «Cerrar y aprobar» también se aprueba el combustible: queda
          congelado lo que se descuenta al chofer.
        </p>
      ) : (
        <p className="flex items-center gap-2 text-sm text-exito">
          <Lock className="size-4" /> Viaje cerrado: el canon y los km ya no cambian. Si hay que corregir algo, reabrilo.
        </p>
      )}
      <ErrorBase error={error} />
      <div className="flex flex-wrap gap-3">
        {puedeAprobar && combustiblePorAprobar && (cierraViaje ? puede : true) && (
          <AccionConMotivo
            etiqueta={cierraViaje ? 'Cerrar y aprobar' : 'Aprobar el combustible'}
            icono={<Stamp className="size-4" />}
            primario
            titulo={cierraViaje ? `Cerrar el viaje ${v.numero} y aprobar su combustible` : `Aprobar el combustible del viaje ${v.numero}`}
            explicacion={
              faltaViaje
                ? 'Se aprueba solo el combustible: queda congelado como está ahora. El viaje del chofer queda abierto para cargarle las operaciones, el canon y los km.'
                : `Chofer ${v.chofer.nombre}: ${v.canonTotal.map((c) => formatoImporte(c.moneda, c.total)).join(' + ') || 'sin canon'} y ${formatoNumero(v.kmTotal)} km. El combustible queda congelado como está ahora.`
            }
            pideMotivo={false}
            ocupado={cerrarYAprobar.isPending}
            error={null}
            onConfirmar={() => ejecutar(cerrarYAprobar.mutateAsync({ viajeId: v.id, versionFila: v.versionFila }))}
          />
        )}
        {puede && v.estado === 'abierto' && (
          <AccionConMotivo
            etiqueta="Cerrar viaje"
            icono={<Flag className="size-4" />}
            primario={!(puedeAprobar && combustiblePorAprobar)}
            titulo={`Cerrar el viaje ${v.numero}`}
            explicacion={`Chofer ${v.chofer.nombre}: ${v.canonTotal.map((c) => formatoImporte(c.moneda, c.total)).join(' + ') || 'sin canon'} y ${formatoNumero(v.kmTotal)} km.`}
            pideMotivo={false}
            ocupado={cerrar.isPending}
            error={null}
            onConfirmar={() => ejecutar(cerrar.mutateAsync({ viajeId: v.id, versionFila: v.versionFila }))}
          />
        )}
        {puede && v.estado === 'cerrado' && (
          <AccionConMotivo
            etiqueta="Reabrir"
            icono={<RotateCcw className="size-4" />}
            titulo="Reabrir el viaje"
            explicacion="Vuelve a quedar abierto para corregir las operaciones, el canon o los km."
            ocupado={reabrir.isPending}
            error={null}
            onConfirmar={(motivo) => ejecutar(reabrir.mutateAsync({ viajeId: v.id, motivo }))}
          />
        )}
        {puede && v.estado === 'abierto' && (
          <AccionConMotivo
            etiqueta="Anular viaje"
            icono={<Ban className="size-4" />}
            titulo="Anular el viaje"
            explicacion="Solo si se inició por error. La carga de salida queda libre para iniciar otro viaje."
            ocupado={anular.isPending}
            error={null}
            onConfirmar={(motivo) => ejecutar(anular.mutateAsync({ viajeId: v.id, motivo }))}
          />
        )}
        <Link href={`/combustible/cargas/nueva`} className={BOTON_SECUNDARIO}>
          <Fuel className="size-4" /> Registrar una carga
        </Link>
      </div>
    </Seccion>
  );
}
