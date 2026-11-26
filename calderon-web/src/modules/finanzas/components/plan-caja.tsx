'use client';

import { useState, type ReactNode } from 'react';
import { AlertTriangle, CalendarClock, Check, LoaderCircle, Pencil, Plus, Undo2, X } from 'lucide-react';
import { TD, TH, useEnvio } from '@/modules/catalogos/components/comun';
import { Cargando, Chip, ErrorBase, ErrorLectura } from '@/modules/combustible/components/comun/ui';
import { useAbrirFicha } from '@/modules/core/fichas/contexto';
import { cn } from '@/shared/lib/cn';
import { formatearFechaDia } from '@/shared/lib/fechas';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, CONTROL_FILTRO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { FilaDesplegable, FlechaFila, useFilaAbierta } from '@/shared/ui/fila-desplegable';
import { dinero } from '../domain/finanzas.types';
import {
  agruparPartidas,
  CERTEZAS,
  ETIQUETA_CERTEZA,
  ETIQUETA_REPETIR,
  etiquetaSemana,
  OPCIONES_PLAN_INICIAL,
  partidasDeCubo,
  partidasDeSemana,
  REPETIR,
  SEMANAS_PLAN,
  situacionPlan,
  type Certeza,
  type OpcionesPlan,
  type OrigenAjustable,
  type PartidaPlan,
  type PlanCaja as Plan,
  type Repetir,
  type SemanaPlan,
  type Sentido,
} from '../domain/plan-caja';
import { useAjustarPlanCaja, useCerrarPartidaCaja, useGuardarPartidaCaja, usePlanCaja } from '../queries/plan-caja.hooks';
import { Aviso, Indicador, SeccionPlegada } from './comun';

const diaMes = (d: string | null) => (d ? formatearFechaDia(d).slice(0, 5) : '—');
const MONEDAS_PARTIDA = ['CLP', 'USD', 'ARS'] as const;

/**
 * Migración 367 · Finanzas › Cobros y pagos › Planificador de caja.
 * La caja de hoy y, semana por semana, lo que entra, lo que sale y cómo queda el saldo. Se arma con lo que está
 * cargado en el sistema (facturas, viajes sin facturar, gastos, cuotas, sueldos) y con lo que se agrega a mano
 * (ventas de activos, cobranzas acordadas, impuestos). Cada renglón se abre debajo para cambiarle la fecha.
 */
export function PlanCaja({ onVerPorCobrar, onVerPorPagar }: { onVerPorCobrar?: () => void; onVerPorPagar?: () => void }) {
  const [op, setOp] = useState<OpcionesPlan>(OPCIONES_PLAN_INICIAL);
  const { data: plan, isPending, isError, error, refetch, isFetching } = usePlanCaja(op);
  const [alta, setAlta] = useState<Sentido | null>(null);
  const [verCuentas, setVerCuentas] = useState(false);
  const semana = useFilaAbierta<number>();

  if (isPending) return <Cargando texto="Armando el plan de caja…" />;
  if (isError) return <ErrorLectura texto="No se pudo armar el plan de caja." error={error} onReintentar={() => void refetch()} />;
  if (!plan) {
    return (
      <Aviso>
        El planificador de caja todavía no está en la base: falta correr la migración <b>20261126190000_planificador_de_caja.sql</b>.
      </Aviso>
    );
  }

  const m = plan.moneda;
  const r = plan.resumen;
  const sit = situacionPlan(plan);
  const sinCobrar = partidasDeCubo(plan, 'sin_fecha', 'entrada');
  const sinPagar = partidasDeCubo(plan, 'sin_fecha', 'salida');
  const despues = partidasDeCubo(plan, 'despues');
  const noContar = partidasDeCubo(plan, 'no_contar');
  const sinCambio = partidasDeCubo(plan, 'sin_cambio');
  const mayor = Math.max(1, ...plan.plan.map((s) => Math.abs(s.saldo)), Math.abs(plan.caja.total));
  const acciones = { onVerPorCobrar, onVerPorPagar };

  return (
    <div className="space-y-5">
      {/* Cómo se mira el plan */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div role="group" aria-label="Moneda del plan" className="inline-flex overflow-hidden rounded-md border border-borde">
          {(['CLP', 'USD'] as const).map((x) => (
            <button
              key={x}
              type="button"
              aria-pressed={op.moneda === x}
              onClick={() => setOp({ ...op, moneda: x })}
              className={cn('h-9 px-3 text-sm', op.moneda === x ? 'bg-marca font-medium text-white' : 'bg-panel text-tinta hover:bg-hover')}
            >
              {x === 'CLP' ? 'En pesos' : 'En dólares'}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-tinta-suave">
          Semanas
          <select className={CONTROL_FILTRO} value={op.semanas} onChange={(e) => setOp({ ...op, semanas: Number(e.target.value) })}>
            {SEMANAS_PLAN.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-tinta">
          <input type="checkbox" className="accent-marca" checked={op.conViajes} onChange={(e) => setOp({ ...op, conViajes: e.target.checked })} />
          Contar los viajes sin facturar
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-tinta">
          <input type="checkbox" className="accent-marca" checked={op.conDudosas} onChange={(e) => setOp({ ...op, conDudosas: e.target.checked })} />
          Contar también lo dudoso
        </label>
        {isFetching && <LoaderCircle className="size-4 animate-spin text-tinta-suave" aria-label="Actualizando" />}
        {plan.puedeEditar && (
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            <button type="button" className={BOTON_SECUNDARIO} onClick={() => setAlta('entrada')}>
              <Plus className="size-4" /> Entrada prevista
            </button>
            <button type="button" className={BOTON_SECUNDARIO} onClick={() => setAlta('salida')}>
              <Plus className="size-4" /> Salida prevista
            </button>
          </div>
        )}
      </div>

      {alta && (
        <section className={cn(TARJETA, 'p-4')} aria-label="Nueva partida prevista">
          <FormPartida key={alta} plan={plan} tipo={alta} onCerrar={() => setAlta(null)} />
        </section>
      )}

      {/* La respuesta corta */}
      <p
        role="status"
        className={cn(
          'flex items-start gap-2 rounded-lg border p-3 text-sm font-medium',
          sit.tono === 'mal' ? 'border-error/30 bg-error-suave text-error' : sit.tono === 'justo' ? 'border-alerta/30 bg-alerta-suave text-alerta' : 'border-exito/30 bg-exito/10 text-exito',
        )}
      >
        {sit.tono === 'bien' ? <Check className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />} {sit.texto}
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className={cn(TARJETA, 'p-4')}>
          <p className="text-xs font-medium text-tinta-suave">Caja de hoy</p>
          <p className={cn('mt-1 text-2xl font-semibold tabular-nums', plan.caja.total < 0 ? 'text-error' : 'text-tinta')}>{dinero(plan.caja.total, m)}</p>
          <button type="button" className="mt-1 text-xs text-marca hover:underline" aria-expanded={verCuentas} onClick={() => setVerCuentas(!verCuentas)}>
            {verCuentas ? 'Ocultar las cuentas' : `Ver las ${plan.caja.cuentas.length} cuentas`}
          </button>
        </div>
        <Indicador titulo={`Entra en ${plan.semanas} semanas`} valor={dinero(r.entradas, m)} detalle="Facturas, viajes sin facturar y entradas previstas" />
        <Indicador titulo={`Sale en ${plan.semanas} semanas`} valor={dinero(r.salidas, m)} detalle="Gastos, cuotas, sueldos y salidas previstas" />
        <Indicador
          titulo={`Saldo al ${formatearFechaDia(plan.hasta)}`}
          valor={dinero(r.saldoFinal, m)}
          tono={r.saldoFinal < 0 ? 'error' : 'normal'}
          detalle={r.saldoMinimo ? `El punto más bajo: ${dinero(r.saldoMinimo.saldo, m)} (${etiquetaSemana(r.saldoMinimo).toLowerCase()})` : undefined}
        />
      </div>

      {verCuentas && (
        <section className={cn(TARJETA, 'overflow-x-auto')} aria-label="Cuentas">
          <table className="w-full text-sm">
            <thead className="border-b border-borde bg-fondo">
              <tr>
                <th className={TH}>Cuenta</th>
                <th className={cn(TH, 'text-right')}>Saldo</th>
                <th className={cn(TH, 'text-right')}>En {m}</th>
                <th className={TH}>Última cartola</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {plan.caja.cuentas.map((c) => (
                <tr key={c.id}>
                  <td className={TD}>
                    {c.nombre} <span className="text-xs text-tinta-suave">{c.tipo === 'caja' ? '(caja)' : ''}</span>
                  </td>
                  <td className={cn(TD, 'text-right tabular-nums')}>{dinero(c.saldo, c.moneda)}</td>
                  <td className={cn(TD, 'text-right tabular-nums')}>{c.saldoVista === null ? 'sin tipo de cambio' : dinero(c.saldoVista, m)}</td>
                  <td className={cn(TD, 'text-xs text-tinta-suave')}>
                    {c.tipo === 'caja' ? '—' : c.cartolaFecha ? `${formatearFechaDia(c.cartolaFecha)}${c.cartolaSaldo !== null ? ` · saldo del banco ${dinero(c.cartolaSaldo, c.moneda)}` : ''}` : 'sin cartola'}
                    {c.porConciliar > 0 && <span className="block text-alerta">{c.porConciliar} sin conciliar</span>}
                  </td>
                </tr>
              ))}
              {plan.caja.cuentas.length === 0 && (
                <tr>
                  <td className={cn(TD, 'text-tinta-suave')} colSpan={4}>
                    No hay bancos ni cajas activos. Se cargan en Finanzas › Bancos.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}

      {(r.sinFechaCobrar.cantidad > 0 || r.sinFechaPagar.cantidad > 0) && (
        <div className="grid gap-3 lg:grid-cols-2">
          {r.sinFechaCobrar.cantidad > 0 && (
            <Aviso>
              <b>
                Por cobrar sin fecha: {dinero(r.sinFechaCobrar.monto, m)} en {r.sinFechaCobrar.cantidad} {r.sinFechaCobrar.cantidad === 1 ? 'factura vencida' : 'facturas vencidas'}.
              </b>{' '}
              No entra en ninguna semana hasta que cargues cuándo va a pagar cada cliente.{' '}
              <a href="#plan-sin-fecha-cobrar" className="font-medium underline">
                Ponerles fecha ↓
              </a>
            </Aviso>
          )}
          {r.sinFechaPagar.cantidad > 0 && (
            <Aviso>
              <b>
                Por pagar sin fecha: {dinero(r.sinFechaPagar.monto, m)} en {r.sinFechaPagar.cantidad} {r.sinFechaPagar.cantidad === 1 ? 'partida' : 'partidas'}.
              </b>{' '}
              No sale en ninguna semana hasta que decidas cuándo se paga. Si se pagara todo hoy, la caja quedaría en {dinero(plan.caja.total - r.sinFechaPagar.monto, m)}.{' '}
              <a href="#plan-sin-fecha-pagar" className="font-medium underline">
                Ponerles fecha ↓
              </a>
            </Aviso>
          )}
        </div>
      )}

      {/* El plan, semana por semana */}
      <section className={cn(TARJETA, 'overflow-hidden')} aria-label="Plan por semana">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-borde bg-fondo">
              <tr>
                <th className={TH}>Semana</th>
                <th className={cn(TH, 'hidden text-right sm:table-cell')}>Entra</th>
                <th className={cn(TH, 'hidden text-right sm:table-cell')}>Sale</th>
                <th className={cn(TH, 'text-right')}>Saldo al final</th>
                <th className={cn(TH, 'hidden text-right md:table-cell')} title="Si solo entran los cobros marcados como seguros y sale todo lo previsto">
                  Si solo entra lo seguro
                </th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              <tr className="bg-fondo/60">
                <td className={cn(TD, 'font-medium text-tinta')}>
                  Caja de hoy <span className="font-normal text-tinta-suave">({formatearFechaDia(plan.hoy)})</span>
                </td>
                <td className={cn(TD, 'hidden sm:table-cell')} />
                <td className={cn(TD, 'hidden sm:table-cell')} />
                <td className={cn(TD, 'text-right font-semibold whitespace-nowrap tabular-nums', plan.caja.total < 0 && 'text-error')}>{dinero(plan.caja.total, m)}</td>
                <td className={cn(TD, 'hidden md:table-cell')} />
                <td />
              </tr>
              {plan.plan.map((s) => (
                <FilaDesplegable key={s.n} abierta={semana.es(s.n)} onAlternar={() => semana.alternar(s.n)} columnas={6} detalle={<DetalleSemana plan={plan} semana={s} {...acciones} />}>
                  <td className={TD}>
                    <span className="font-medium whitespace-nowrap text-tinta">{etiquetaSemana(s)}</span>
                    <span className="hidden text-xs text-tinta-suave sm:block">
                      {diaMes(s.desde)} al {diaMes(s.hasta)}
                    </span>
                    {/* En el celular no entran las columnas: lo que entra y lo que sale va acá */}
                    <span className="block text-xs whitespace-nowrap tabular-nums sm:hidden">
                      {s.entradas > 0 && <span className="text-exito">+ {dinero(s.entradas, m)}</span>}
                      {s.entradas > 0 && s.salidas > 0 && <span className="text-tinta-suave"> · </span>}
                      {s.salidas > 0 && <span className="text-tinta">− {dinero(s.salidas, m)}</span>}
                      {s.entradas === 0 && s.salidas === 0 && <span className="text-tinta-suave">sin movimientos</span>}
                    </span>
                  </td>
                  <td className={cn(TD, 'hidden text-right whitespace-nowrap tabular-nums sm:table-cell', s.entradas > 0 ? 'text-exito' : 'text-tinta-suave')}>
                    {s.entradas > 0 ? `+ ${dinero(s.entradas, m)}` : '—'}
                  </td>
                  <td className={cn(TD, 'hidden text-right whitespace-nowrap tabular-nums sm:table-cell', s.salidas === 0 && 'text-tinta-suave')}>
                    {s.salidas > 0 ? `− ${dinero(s.salidas, m)}` : '—'}
                  </td>
                  <td className={cn(TD, 'text-right font-semibold whitespace-nowrap tabular-nums', s.saldo < 0 ? 'text-error' : 'text-tinta')}>
                    {dinero(s.saldo, m)}
                    <span className="mt-1 ml-auto block h-1.5 w-24 max-w-full overflow-hidden rounded-full bg-borde" aria-hidden>
                      <span className={cn('block h-full rounded-full', s.saldo < 0 ? 'bg-error' : 'bg-exito')} style={{ width: `${Math.max(4, Math.round((Math.abs(s.saldo) / mayor) * 100))}%` }} />
                    </span>
                  </td>
                  <td className={cn(TD, 'hidden text-right whitespace-nowrap tabular-nums md:table-cell', s.saldoPrudente < 0 ? 'text-error' : 'text-tinta-suave')}>{dinero(s.saldoPrudente, m)}</td>
                  <td className={cn(TD, 'w-8 px-1')}>
                    <FlechaFila abierta={semana.es(s.n)} />
                  </td>
                </FilaDesplegable>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-borde px-3 py-2 text-xs text-tinta-suave">
          Tocá una semana para ver qué entra y qué sale, y cambiarle la fecha a cada cosa. El plan usa solo lo que está cargado en el sistema y lo que agregues a mano: lo que todavía no está cargado (sueldos
          de los meses que vienen, combustible que falta cargar, impuestos e imposiciones) no aparece hasta que lo agregues como «Salida prevista».
        </p>
      </section>

      {plan.avisos.length > 0 && (
        <Aviso>
          <ul className="list-inside list-disc space-y-1">
            {plan.avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </Aviso>
      )}

      {sinCobrar.length > 0 && (
        <section id="plan-sin-fecha-cobrar" className={cn(TARJETA, 'scroll-mt-20 space-y-3 p-4')}>
          <div>
            <h2 className="font-medium text-tinta">
              Por cobrar vencido, sin fecha de cobro · <span className="whitespace-nowrap">{dinero(r.sinFechaCobrar.monto, m)}</span>
            </h2>
            <p className="text-xs text-tinta-suave">Pedile a cada cliente la fecha en que va a pagar y cargala: recién ahí entra en el plan.</p>
          </div>
          <ListaPartidas plan={plan} partidas={sinCobrar} {...acciones} />
        </section>
      )}
      {sinPagar.length > 0 && (
        <section id="plan-sin-fecha-pagar" className={cn(TARJETA, 'scroll-mt-20 space-y-3 p-4')}>
          <div>
            <h2 className="font-medium text-tinta">
              Por pagar sin fecha de pago · <span className="whitespace-nowrap">{dinero(r.sinFechaPagar.monto, m)}</span>
            </h2>
            <p className="text-xs text-tinta-suave">Lo vencido y lo que todavía no tiene factura. Decidí cuándo se paga cada cosa para verlo en la semana que corresponde.</p>
          </div>
          <ListaPartidas plan={plan} partidas={sinPagar} {...acciones} />
        </section>
      )}

      {despues.length > 0 && (
        <SeccionPlegada titulo={`Después de las ${plan.semanas} semanas · entra ${dinero(r.despuesEntradas, m)} · sale ${dinero(r.despuesSalidas, m)}`}>
          <ListaPartidas plan={plan} partidas={despues} {...acciones} />
        </SeccionPlegada>
      )}
      {noContar.length > 0 && (
        <SeccionPlegada titulo={`No se cuenta (${noContar.length})`}>
          <ListaPartidas plan={plan} partidas={noContar} {...acciones} />
        </SeccionPlegada>
      )}
      {sinCambio.length > 0 && (
        <SeccionPlegada titulo={`Sin tipo de cambio (${sinCambio.length})`}>
          <ListaPartidas plan={plan} partidas={sinCambio} {...acciones} />
        </SeccionPlegada>
      )}
      {plan.cerradas.length > 0 && (
        <SeccionPlegada titulo={`Entradas y salidas previstas que ya se cerraron (${plan.cerradas.length})`}>
          <Cerradas plan={plan} />
        </SeccionPlegada>
      )}
    </div>
  );
}

interface Ir {
  onVerPorCobrar?: (() => void) | undefined;
  onVerPorPagar?: (() => void) | undefined;
}

/** Lo que entra y lo que sale en una semana, por renglón del plan. */
function DetalleSemana({ plan, semana, ...ir }: { plan: Plan; semana: SemanaPlan } & Ir) {
  const grupos = agruparPartidas(partidasDeSemana(plan, semana.n));
  if (grupos.length === 0) return <p className="p-2 text-sm text-tinta-suave">No hay nada previsto para esta semana.</p>;
  return (
    <div className="space-y-4">
      {grupos.map((g) => (
        <div key={g.codigo} className="space-y-1">
          <p className="flex flex-wrap items-baseline justify-between gap-2 text-xs font-semibold tracking-wide text-tinta-suave uppercase">
            <span>
              {g.sentido === 'entrada' ? 'Entra' : 'Sale'} · {g.nombre}
            </span>
            <span className={cn('tabular-nums', g.sentido === 'entrada' ? 'text-exito' : 'text-tinta')}>
              {g.sentido === 'entrada' ? '+' : '−'} {dinero(g.total, plan.moneda)}
            </span>
          </p>
          <ListaPartidas plan={plan} partidas={g.partidas} {...ir} />
        </div>
      ))}
    </div>
  );
}

/** Lista de partidas del plan: cada renglón se abre debajo con lo que se le puede cambiar. */
function ListaPartidas({ plan, partidas, ...ir }: { plan: Plan; partidas: PartidaPlan[] } & Ir) {
  const fila = useFilaAbierta<string>();
  return (
    <div className="overflow-x-auto rounded-lg border border-borde bg-panel">
      <table className="w-full text-sm">
        <tbody className="divide-y divide-borde">
          {partidas.map((p) => (
            <FilaDesplegable
              key={p.clave}
              abierta={fila.es(p.clave)}
              onAlternar={() => fila.alternar(p.clave)}
              columnas={4}
              detalle={<DetallePartida plan={plan} p={p} onListo={fila.cerrar} {...ir} />}
              className={cn(!p.cuenta && p.cubo === 'semana' && 'opacity-70')}
            >
              <td className={cn(TD, 'w-12 px-2 whitespace-nowrap tabular-nums sm:w-16 sm:px-3', p.atrasada ? 'text-error' : 'text-tinta-suave')}>{diaMes(p.fecha)}</td>
              <td className={cn(TD, 'px-2 sm:px-3')}>
                <span className="font-medium text-tinta">{p.titulo}</span>
                {/* En el celular no entra la columna del monto */}
                <span className={cn('block font-medium whitespace-nowrap tabular-nums sm:hidden', p.sentido === 'entrada' ? 'text-exito' : 'text-tinta')}>
                  {p.sentido === 'entrada' ? '+' : '−'} {p.montoVista === null ? dinero(p.monto, p.moneda) : dinero(p.montoVista, plan.moneda)}
                  {p.moneda !== plan.moneda && p.montoVista !== null && <span className="font-normal text-tinta-suave"> ({dinero(p.monto, p.moneda)})</span>}
                </span>
                {p.detalle && <span className="block text-xs text-tinta-suave">{p.detalle}</span>}
                <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  {(p.sentido === 'entrada' || p.certeza !== 'segura') && <Chip tono={p.certeza === 'segura' ? 'exito' : p.certeza === 'dudosa' ? 'alerta' : 'neutro'}>{ETIQUETA_CERTEZA[p.certeza]}</Chip>}
                  {p.cubo === 'semana' && !p.cuenta && <Chip tono="alerta">No se cuenta</Chip>}
                  {p.ajustada && <Chip tono="marca">Cambiada a mano</Chip>}
                  {p.nota && <span className="text-xs text-tinta-suave">«{p.nota}»</span>}
                </span>
              </td>
              <td className={cn(TD, 'hidden text-right whitespace-nowrap tabular-nums sm:table-cell')}>
                <span className={cn('font-medium', p.sentido === 'entrada' ? 'text-exito' : 'text-tinta')}>
                  {p.sentido === 'entrada' ? '+' : '−'} {p.montoVista === null ? dinero(p.monto, p.moneda) : dinero(p.montoVista, plan.moneda)}
                </span>
                {p.moneda !== plan.moneda && p.montoVista !== null && <span className="block text-xs text-tinta-suave">{dinero(p.monto, p.moneda)}</span>}
              </td>
              <td className={cn(TD, 'w-8 px-1')}>
                <FlechaFila abierta={fila.es(p.clave)} />
              </td>
            </FilaDesplegable>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Lo que se puede hacer con una partida: cambiarle la fecha (las del sistema) o editarla y cerrarla (las cargadas a mano). */
function DetallePartida({ plan, p, onListo, onVerPorCobrar, onVerPorPagar }: { plan: Plan; p: PartidaPlan; onListo: () => void } & Ir) {
  const abrirFicha = useAbrirFicha();
  const enlaces = (
    <>
      {p.origen === 'factura' && (
        <button type="button" className="text-sm text-marca hover:underline" onClick={() => abrirFicha('factura', p.id)}>
          Abrir la factura
        </button>
      )}
      {p.origen === 'factura' && onVerPorCobrar && (
        <button type="button" className="text-sm text-marca hover:underline" onClick={onVerPorCobrar}>
          Ir a Por cobrar →
        </button>
      )}
      {(p.origen === 'gasto' || p.origen === 'cargas_proveedor') && onVerPorPagar && (
        <button type="button" className="text-sm text-marca hover:underline" onClick={onVerPorPagar}>
          Ir a Por pagar →
        </button>
      )}
    </>
  );
  return (
    <div className="space-y-3">
      {p.supuesto && (
        <p className="flex items-start gap-1.5 text-xs text-tinta-suave">
          <CalendarClock className="mt-0.5 size-3.5 shrink-0" /> {p.supuesto}
          {p.fechaBase && p.fecha !== p.fechaBase && p.origen !== 'partida' ? ` (fecha original: ${formatearFechaDia(p.fechaBase)})` : ''}
        </p>
      )}
      {!plan.puedeEditar ? (
        <div className="flex flex-wrap gap-3">{enlaces}</div>
      ) : p.origen === 'partida' ? (
        <AccionesPartida plan={plan} p={p} onListo={onListo} />
      ) : p.ajustable ? (
        <EditorAjuste plan={plan} p={p} onListo={onListo} enlaces={enlaces} />
      ) : (
        <div className="flex flex-wrap gap-3">{enlaces}</div>
      )}
    </div>
  );
}

/** Fecha esperada, si se cuenta y qué tan segura es una partida que sale del sistema. */
function EditorAjuste({ plan, p, onListo, enlaces }: { plan: Plan; p: PartidaPlan; onListo: () => void; enlaces: ReactNode }) {
  const ajustar = useAjustarPlanCaja();
  const envio = useEnvio();
  // Solo se guarda lo que carga una persona: la fecha y la certeza que propone el sistema quedan vacías
  const [fecha, setFecha] = useState(p.fechaCargada ?? '');
  const [contar, setContar] = useState(p.cubo !== 'no_contar');
  const [certeza, setCerteza] = useState<Certeza | ''>(p.certezaCargada ?? '');
  const [nota, setNota] = useState(p.nota ?? '');
  const entrada = p.sentido === 'entrada';
  const guardar = (d: { fecha: string | null; contar: boolean; certeza: Certeza | null; nota: string | null }) =>
    void envio.enviar(ajustar.mutateAsync({ origen: p.origen as OrigenAjustable, id: p.id, ...d }), onListo);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {!p.soloContar && (
          <Campo label={entrada ? '¿Cuándo se espera cobrar?' : '¿Cuándo se piensa pagar?'} ayuda={p.fechaCargada ? undefined : `Hoy el plan usa: ${p.fecha ? formatearFechaDia(p.fecha) : 'sin fecha'}`}>
            <input type="date" min={plan.hoy} value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Campo>
        )}
        <Campo label="¿Qué tan seguro es?">
          <select value={certeza} onChange={(e) => setCerteza(e.target.value as Certeza | '')}>
            <option value="">Automático{p.certezaCargada ? '' : ` (${ETIQUETA_CERTEZA[p.certeza].toLowerCase()})`}</option>
            {CERTEZAS.map((c) => (
              <option key={c} value={c}>
                {ETIQUETA_CERTEZA[c]}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Nota (opcional)">
          <input value={nota} maxLength={300} placeholder={entrada ? 'Con quién se habló, qué prometió…' : 'Qué se acordó con el proveedor…'} onChange={(e) => setNota(e.target.value)} />
        </Campo>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-tinta">
          <input type="checkbox" className="accent-marca" checked={contar} onChange={(e) => setContar(e.target.checked)} /> Contarla en el plan
        </label>
      </div>
      <ErrorBase error={envio.error} />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={BOTON_PRIMARIO}
          disabled={ajustar.isPending}
          onClick={() => guardar({ fecha: p.soloContar || fecha === '' ? null : fecha, contar, certeza: certeza === '' ? null : certeza, nota: nota.trim() === '' ? null : nota })}
        >
          {ajustar.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} Guardar
        </button>
        {p.ajustada && (
          <button type="button" className={BOTON_SECUNDARIO} disabled={ajustar.isPending} onClick={() => guardar({ fecha: null, contar: true, certeza: null, nota: null })}>
            <Undo2 className="size-4" /> Volver a lo que calcula el sistema
          </button>
        )}
        {enlaces}
      </div>
    </div>
  );
}

/** Una entrada o salida cargada a mano: editarla, marcar que ya se cumplió o anularla. */
function AccionesPartida({ plan, p, onListo }: { plan: Plan; p: PartidaPlan; onListo: () => void }) {
  const cerrar = useCerrarPartidaCaja();
  const envio = useEnvio();
  const [modo, setModo] = useState<'ver' | 'editar' | 'cumplir'>('ver');
  const [fecha, setFecha] = useState(plan.hoy);
  const entrada = p.sentido === 'entrada';

  if (modo === 'editar') return <FormPartida plan={plan} tipo={p.sentido} partida={p} onCerrar={onListo} />;
  return (
    <div className="space-y-3">
      {entrada && p.categoria === 'venta_activo' && <AyudaVentaActivo plan={plan} />}
      {modo === 'cumplir' && (
        <div className="flex flex-wrap items-end gap-3">
          <Campo label={entrada ? '¿Qué día entró la plata?' : '¿Qué día se pagó?'} ayuda="Sale del plan: la plata ya está en el saldo del banco o de la caja.">
            <input type="date" max={plan.hoy} value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Campo>
          <button type="button" className={BOTON_PRIMARIO} disabled={cerrar.isPending} onClick={() => void envio.enviar(cerrar.mutateAsync({ id: p.id, accion: 'cumplida', fecha }), onListo)}>
            {cerrar.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} Confirmar
          </button>
          <button type="button" className={BOTON_SECUNDARIO} onClick={() => setModo('ver')}>
            Volver
          </button>
        </div>
      )}
      <ErrorBase error={envio.error} />
      {modo === 'ver' && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={BOTON_PRIMARIO} onClick={() => setModo('cumplir')}>
            <Check className="size-4" /> {entrada ? 'Ya entró' : 'Ya se pagó'}
          </button>
          <button type="button" className={BOTON_SECUNDARIO} onClick={() => setModo('editar')}>
            <Pencil className="size-4" /> Cambiar
          </button>
          <button type="button" className={BOTON_SECUNDARIO} disabled={cerrar.isPending} onClick={() => void envio.enviar(cerrar.mutateAsync({ id: p.id, accion: 'anulada', fecha: null }), onListo)}>
            <X className="size-4" /> Ya no va
          </button>
        </div>
      )}
    </div>
  );
}

/** Cómo se registra la plata de la venta de un activo cuando entra. */
function AyudaVentaActivo({ plan }: { plan: Plan }) {
  const c = plan.cuentaVentaActivos;
  return (
    <p className="rounded-lg bg-marca-suave p-3 text-xs text-tinta">
      <b>Cuando entre la plata:</b> en Finanzas › Bancos abrí la cuenta donde entró y, en esa línea de la cartola, tocá «Decir qué es…», elegí «Otro ingreso» y la cuenta contable{' '}
      {c ? (
        <b>
          {c.codigo} {c.nombre}
        </b>
      ) : (
        <b>de ventas de activos (hay que crearla en Configuración › Plan de cuentas)</b>
      )}
      . Si la pagaron en efectivo, se anota en Bancos › Movimientos › «Otro ingreso, egreso o transferencia». Después tocá «Ya entró» acá, para que no se cuente dos veces. La unidad vendida se da de baja en
      Flota (estado Inactivo; los generadores, Baja).
    </p>
  );
}

/** Alta o cambio de una entrada o salida prevista. */
function FormPartida({ plan, tipo, partida, onCerrar }: { plan: Plan; tipo: Sentido; partida?: PartidaPlan; onCerrar: () => void }) {
  const guardar = useGuardarPartidaCaja();
  const envio = useEnvio();
  const categorias = plan.categorias.filter((k) => k.tipo === tipo);
  const [d, setD] = useState({
    categoria: partida?.categoria ?? categorias[0]?.codigo ?? '',
    descripcion: partida?.descripcion ?? '',
    tercero: partida?.tercero ?? '',
    fecha: partida?.fecha ?? '',
    moneda: partida?.moneda ?? 'CLP',
    monto: partida ? String(partida.monto).replace('.', ',') : '',
    certeza: (partida?.certeza ?? (tipo === 'entrada' ? 'probable' : 'segura')) as Certeza,
    nota: partida?.nota ?? '',
    cada: 'no' as Repetir,
    veces: 3,
  });
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }));
  const entrada = tipo === 'entrada';

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void envio.enviar(
          guardar.mutateAsync({
            id: partida?.id ?? null,
            version: partida?.version ?? null,
            tipo,
            categoria: d.categoria,
            descripcion: d.descripcion,
            tercero: d.tercero,
            fecha: d.fecha,
            moneda: d.moneda,
            monto: d.monto,
            certeza: d.certeza,
            nota: d.nota,
            repetir: { cada: partida ? 'no' : d.cada, veces: partida || d.cada === 'no' ? 1 : d.veces },
          }),
          onCerrar,
        );
      }}
    >
      <h3 className="font-medium text-tinta">{partida ? 'Cambiar' : 'Nueva'} {entrada ? 'entrada prevista' : 'salida prevista'}</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Campo label="¿Qué es?" error={envio.campo('categoria')}>
          <select value={d.categoria} onChange={(e) => set('categoria', e.target.value)}>
            {categorias.map((k) => (
              <option key={k.codigo} value={k.codigo}>
                {k.nombre}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Descripción" error={envio.campo('descripcion')}>
          <input value={d.descripcion} maxLength={200} placeholder={entrada ? 'Venta del tractor ABCD12' : 'Imposiciones de noviembre'} onChange={(e) => set('descripcion', e.target.value)} />
        </Campo>
        <Campo label={entrada ? '¿Quién paga? (opcional)' : '¿A quién se le paga? (opcional)'} error={envio.campo('tercero')}>
          <input value={d.tercero} maxLength={120} onChange={(e) => set('tercero', e.target.value)} />
        </Campo>
        <Campo label={entrada ? '¿Cuándo se espera cobrar?' : '¿Cuándo se piensa pagar?'} error={envio.campo('fecha')}>
          <input type="date" min={plan.hoy} value={d.fecha} onChange={(e) => set('fecha', e.target.value)} />
        </Campo>
        <Campo label="Moneda" error={envio.campo('moneda')}>
          <select value={d.moneda} onChange={(e) => set('moneda', e.target.value)}>
            {MONEDAS_PARTIDA.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Monto" error={envio.campo('monto')}>
          <input inputMode="decimal" value={d.monto} placeholder="0" onChange={(e) => set('monto', e.target.value)} />
        </Campo>
        <Campo label="¿Qué tan seguro es?" error={envio.campo('certeza')}>
          <select value={d.certeza} onChange={(e) => set('certeza', e.target.value as Certeza)}>
            {CERTEZAS.map((c) => (
              <option key={c} value={c}>
                {ETIQUETA_CERTEZA[c]}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Nota (opcional)" error={envio.campo('nota')}>
          <input value={d.nota} maxLength={300} onChange={(e) => set('nota', e.target.value)} />
        </Campo>
        {!partida && (
          <Campo label="¿Se repite?" ayuda="Para cuotas: crea una partida por cada vez.">
            <select value={d.cada} onChange={(e) => set('cada', e.target.value as Repetir)}>
              {REPETIR.map((x) => (
                <option key={x} value={x}>
                  {ETIQUETA_REPETIR[x]}
                </option>
              ))}
            </select>
          </Campo>
        )}
        {!partida && d.cada !== 'no' && (
          <Campo label="¿Cuántas veces en total?" error={envio.campo('repetir.veces')}>
            <input type="number" min={2} max={24} value={d.veces} onChange={(e) => set('veces', Number(e.target.value))} />
          </Campo>
        )}
      </div>
      {entrada && d.categoria === 'venta_activo' && <AyudaVentaActivo plan={plan} />}
      <ErrorBase error={envio.error} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={BOTON_PRIMARIO} disabled={guardar.isPending}>
          {guardar.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} Guardar
        </button>
        <button type="button" className={BOTON_SECUNDARIO} onClick={onCerrar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** Las partidas cargadas a mano que ya se cerraron (cumplidas o anuladas), por si hay que volver a abrir alguna. */
function Cerradas({ plan }: { plan: Plan }) {
  const cerrar = useCerrarPartidaCaja();
  const envio = useEnvio();
  return (
    <div className="space-y-2">
      <ErrorBase error={envio.error} />
      <ul className="divide-y divide-borde text-sm">
        {plan.cerradas.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>
              <span className="font-medium text-tinta">{c.descripcion}</span>
              {c.tercero && <span className="text-tinta-suave"> · {c.tercero}</span>}
              <span className="block text-xs text-tinta-suave">
                {c.estado === 'cumplida' ? (c.tipo === 'entrada' ? 'Entró' : 'Se pagó') : 'Anulada'} el {formatearFechaDia(c.cerradaEn)} · estaba para el {formatearFechaDia(c.fecha)}
              </span>
            </span>
            <span className="flex items-center gap-3">
              <span className="tabular-nums">{dinero(c.monto, c.moneda)}</span>
              {plan.puedeEditar && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-marca hover:underline"
                  disabled={cerrar.isPending}
                  onClick={() => void envio.enviar(cerrar.mutateAsync({ id: c.id, accion: 'reabrir', fecha: null }), () => undefined)}
                >
                  <Undo2 className="size-3.5" /> Volver a abrir
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
