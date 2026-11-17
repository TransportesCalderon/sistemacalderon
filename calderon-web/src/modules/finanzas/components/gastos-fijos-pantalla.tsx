'use client';

import { Fragment, useState } from 'react';
import { Pencil, Plus, Repeat, Wand2 } from 'lucide-react';
import { Panel, TD, TH, useEnvio } from '@/modules/catalogos/components/comun';
import { useProveedores } from '@/modules/catalogos/queries/hooks';
import { Cargando, Chip, Encabezado, ErrorBase, ErrorLectura, Seccion, Vacio } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { formatearFechaDia, hoyEnZona } from '@/shared/lib/fechas';
import { BOTON_ICONO, BOTON_PRIMARIO, BOTON_SECUNDARIO, CONTROL_FILTRO } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { Pestanas } from '@/shared/ui/pestanas';
import { PESTANAS_GASTOS } from '@/shared/ui/pestanas-secciones';
import { cuentasParaGasto, dinero, etiquetaDocumento, mesCorto, TIPOS_DOCUMENTO, type GastoFijo, type TipoDocumento } from '../domain/finanzas.types';
import { useCamionesFinanzas, useGastosFijos, useGenerarGastosFijos, useGuardarGastoFijo, usePlanCuentas } from '../queries/hooks';
import { MONEDAS, OpcionesCuentas } from './comun';
import { PagarGasto } from './gasto-ficha';

interface Form {
  id: number | null;
  nombre: string;
  proveedorId: number | null;
  cuentaId: number | null;
  tipoDocumento: TipoDocumento;
  moneda: string;
  monto: string;
  diaVence: string;
  camionId: number | null;
  desde: string;
  hasta: string;
  cuotas: string;
  cuotasPrevias: string;
  camiones: number[];
  semis: number[];
  /** Ya tenía lista de unidades: hay que mandarla aunque quede vacía (para borrarla). */
  teniaUnidades: boolean;
  activo: boolean;
  observacion: string;
}

/** Último día del mes de la última cuota (desde + cuotas), igual que lo calcula la base. Null si faltan datos. */
function ultimaCuota(desde: string, cuotas: string): string | null {
  const n = Number(cuotas);
  const m = /^(\d{4})-(\d{2})/.exec(desde);
  if (!m || !Number.isInteger(n) || n < 1 || n > 600) return null;
  const fin = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 + n, 0));
  return fin.toISOString().slice(0, 10);
}

/** Finanzas › Gastos fijos: lo que se paga todos los meses. El sistema genera cada mes el gasto con este monto. */
export function GastosFijosPantalla() {
  const { zonaHoraria } = useSesion();
  const puede = useCan('finanzas.gastos:editar');
  const { data, isLoading, isError, error, refetch } = useGastosFijos();
  const { data: plan } = usePlanCuentas();
  const { data: proveedores } = useProveedores();
  const { data: camiones } = useCamionesFinanzas();
  const guardar = useGuardarGastoFijo();
  const generar = useGenerarGastosFijos();
  const envio = useEnvio();
  const envioGen = useEnvio();
  const hoy = hoyEnZona(zonaHoraria) as string;
  const mesActual = `${hoy.slice(0, 7)}-01`;
  const sig = new Date(`${mesActual}T12:00:00Z`);
  sig.setUTCMonth(sig.getUTCMonth() + 1);
  const mesSiguiente = sig.toISOString().slice(0, 10);
  const [periodo, setPeriodo] = useState(mesActual);
  const [generados, setGenerados] = useState<number | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [pagando, setPagando] = useState<number | null>(null);
  const puedePagar = useCan('finanzas.cobros_pagos:editar');

  const nuevo = (): Form => ({
    id: null,
    nombre: '',
    proveedorId: null,
    cuentaId: null,
    tipoDocumento: 'factura',
    moneda: 'CLP',
    monto: '',
    diaVence: '5',
    camionId: null,
    desde: mesActual,
    hasta: '',
    cuotas: '',
    cuotasPrevias: '',
    camiones: [],
    semis: [],
    teniaUnidades: false,
    activo: true,
    observacion: '',
  });
  const editar = (f: GastoFijo): Form => ({
    id: f.id,
    nombre: f.nombre,
    proveedorId: f.proveedorId,
    cuentaId: f.cuentaId,
    tipoDocumento: f.tipoDocumento,
    moneda: f.moneda,
    monto: String(f.monto),
    diaVence: String(f.diaVence),
    camionId: f.camionId,
    desde: f.desde,
    hasta: f.hasta ?? '',
    cuotas: f.cuotas !== null ? String(f.cuotas) : '',
    cuotasPrevias: f.cuotasPrevias !== null ? String(f.cuotasPrevias) : '',
    camiones: f.equipos.filter((e) => e.tipo === 'tractor').map((e) => e.id),
    semis: f.equipos.filter((e) => e.tipo === 'semi').map((e) => e.id),
    teniaUnidades: f.equipos.length > 0,
    activo: f.activo,
    observacion: f.observacion ?? '',
  });

  if (isLoading) return <Cargando texto="Cargando los gastos fijos…" />;
  if (isError || !data) return <ErrorLectura texto="No se pudieron leer los gastos fijos." onReintentar={() => void refetch()} error={error} />;
  const totalMes = data.fijos.filter((f) => f.activo && !f.terminado).reduce((s, f) => s + (f.montoClp ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Encabezado titulo="Gastos fijos" subtitulo="Finanzas" />
        {puede && !form && (
          <button type="button" className={BOTON_PRIMARIO} onClick={() => setForm(nuevo())}>
            <Plus className="size-4" /> Nuevo gasto fijo
          </button>
        )}
      </div>
      <Pestanas items={PESTANAS_GASTOS} />
      <p className="text-sm text-tinta-suave">
        Cargá una sola vez lo que se paga todos los meses (arriendo, seguros, leasing, sueldos de oficina, internet…). El día 1 de cada mes el sistema
        crea el gasto con este monto; cuando llega la factura, corregí el monto y el número en el gasto.
      </p>

      {puede && data.fijos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-borde bg-panel p-3">
          <Wand2 className="size-4 text-marca" />
          <span className="text-sm text-tinta">Generar ahora los gastos de</span>
          <select className={CONTROL_FILTRO} value={periodo} onChange={(e) => setPeriodo(e.target.value)} aria-label="Mes">
            <option value={mesActual}>{mesCorto(mesActual)}</option>
            <option value={mesSiguiente}>{mesCorto(mesSiguiente)}</option>
          </select>
          <button
            type="button"
            className={BOTON_SECUNDARIO}
            disabled={generar.isPending}
            onClick={() =>
              void envioGen.enviar(
                generar.mutateAsync({ periodo }).then((r) => {
                  if (r.ok) setGenerados(r.data);
                  return r;
                }),
                () => undefined,
              )
            }
          >
            Generar
          </button>
          {data.faltanMes > 0 && periodo === mesActual && <span className="text-sm text-alerta">Faltan {data.faltanMes} de este mes</span>}
          {generados !== null && <span className="text-sm text-exito">{generados === 0 ? 'No faltaba ninguno.' : `Se generaron ${generados}.`}</span>}
          <ErrorBase error={envioGen.error} />
        </div>
      )}

      {form && (
        <Panel
          titulo={form.id ? 'Cambiar el gasto fijo' : 'Nuevo gasto fijo'}
          explicacion="El monto es el total del mes (con IVA si llega con factura)."
          error={envio.error}
          ocupado={guardar.isPending}
          textoBoton="Guardar"
          onCerrar={() => setForm(null)}
          onConfirmar={() =>
            void envio.enviar(
              guardar.mutateAsync({
                ...form,
                cuentaId: form.cuentaId ?? 0,
                diaVence: Number(form.diaVence) || 0,
                cuotas: form.cuotas.trim() ? Number(form.cuotas) : null,
                cuotasPrevias: form.cuotas.trim() ? Number(form.cuotasPrevias) || 0 : null,
                ...(form.camiones.length + form.semis.length > 0 || form.teniaUnidades ? { camiones: form.camiones, semis: form.semis } : {}),
                hasta: form.cuotas.trim() ? null : form.hasta || null,
              }),
              () => setForm(null),
            )
          }
        >
          <Campo label="Nombre">
            <input value={form.nombre} maxLength={100} placeholder="Ej.: Arriendo oficina" onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          </Campo>
          <Campo label="Categoría (cuenta)">
            <select value={form.cuentaId ?? ''} onChange={(e) => setForm({ ...form, cuentaId: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Elegí…</option>
              <OpcionesCuentas cuentas={cuentasParaGasto(plan ?? [])} />
            </select>
          </Campo>
          <Campo label="Llega con">
            <select value={form.tipoDocumento} onChange={(e) => setForm({ ...form, tipoDocumento: e.target.value as TipoDocumento })}>
              {TIPOS_DOCUMENTO.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.etiqueta}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Proveedor">
            <select value={form.proveedorId ?? ''} onChange={(e) => setForm({ ...form, proveedorId: e.target.value ? Number(e.target.value) : null })}>
              <option value="">— Ninguno —</option>
              {(proveedores ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.razonSocial}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Moneda">
            <select value={form.moneda} onChange={(e) => setForm({ ...form, moneda: e.target.value })}>
              {MONEDAS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </Campo>
          <Campo label="Monto del mes">
            <input inputMode="decimal" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} />
          </Campo>
          <Campo label="Día de vencimiento" ayuda="De 1 a 28.">
            <input inputMode="numeric" value={form.diaVence} onChange={(e) => setForm({ ...form, diaVence: e.target.value })} />
          </Campo>
          <Campo label="Camión (si es de un solo camión)">
            <select disabled={form.camiones.length + form.semis.length > 0} value={form.camionId ?? ''} onChange={(e) => setForm({ ...form, camionId: e.target.value ? Number(e.target.value) : null })}>
              <option value="">— Ninguno —</option>
              {(camiones ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.patente} · {c.codigo}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Desde (mes)">
            <input type="date" value={form.desde} onChange={(e) => setForm({ ...form, desde: e.target.value })} />
          </Campo>
          <Campo
            label="Cantidad de cuotas (leasing o crédito)"
            {...(ultimaCuota(form.desde, form.cuotas) ? { ayuda: `La última cuota es la de ${mesCorto(ultimaCuota(form.desde, form.cuotas)!)}.` } : {})}
          >
            <input
              inputMode="numeric"
              value={form.cuotas}
              maxLength={3}
              placeholder="Vacío si no tiene cuotas"
              onChange={(e) => setForm({ ...form, cuotas: e.target.value.replace(/\D/g, '') })}
            />
          </Campo>
          {form.cuotas.trim() !== '' && (
            <Campo label="Cuotas ya pagadas antes de cargarlo acá" ayuda="El sistema sigue generando una cuota por mes hasta completar el total, aunque se pase de la fecha original.">
              <input
                inputMode="numeric"
                value={form.cuotasPrevias}
                maxLength={3}
                placeholder="0 si empieza ahora"
                onChange={(e) => setForm({ ...form, cuotasPrevias: e.target.value.replace(/\D/g, '') })}
              />
            </Campo>
          )}
          <Campo label={form.cuotas.trim() ? 'Fin original del contrato (lo calcula el sistema)' : 'Hasta (si termina)'}>
            <input
              type="date"
              disabled={!!form.cuotas.trim()}
              value={form.cuotas.trim() ? (ultimaCuota(form.desde, form.cuotas) ?? '') : form.hasta}
              onChange={(e) => setForm({ ...form, hasta: e.target.value })}
            />
          </Campo>
          <Campo label="Nota">
            <input value={form.observacion} maxLength={500} onChange={(e) => setForm({ ...form, observacion: e.target.value })} />
          </Campo>
          <fieldset className="space-y-2 rounded-md border border-borde p-3 sm:col-span-2 lg:col-span-3">
            <legend className="px-1 text-sm font-medium text-tinta">
              Si cubre varias unidades (por ejemplo, un leasing de 3 tractores y 3 semirremolques){' '}
              {form.camiones.length + form.semis.length > 0 && (
                <span className="font-normal text-tinta-suave">
                  · {form.camiones.length + form.semis.length} elegidas: el monto se reparte en partes iguales
                </span>
              )}
            </legend>
            <p className="text-xs font-medium text-tinta-suave">Tractores</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {(camiones ?? []).map((c) => (
                <label key={c.id} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-marca"
                    checked={form.camiones.includes(c.id)}
                    onChange={(e) => setForm({ ...form, camiones: e.target.checked ? [...form.camiones, c.id] : form.camiones.filter((x) => x !== c.id) })}
                  />
                  <span className="font-mono">{c.patente}</span>
                </label>
              ))}
            </div>
            <p className="text-xs font-medium text-tinta-suave">Semirremolques</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {data.semis.map((s) => (
                <label key={s.id} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-marca"
                    checked={form.semis.includes(s.id)}
                    onChange={(e) => setForm({ ...form, semis: e.target.checked ? [...form.semis, s.id] : form.semis.filter((x) => x !== s.id) })}
                  />
                  <span className="font-mono">{s.patente}</span>
                </label>
              ))}
              {data.semis.length === 0 && <span className="text-xs text-tinta-suave">No hay semirremolques para elegir.</span>}
            </div>
          </fieldset>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" className="size-4 accent-marca" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} /> Activo
          </label>
        </Panel>
      )}

      {data.fijos.length === 0 ? (
        <Vacio icono={<Repeat className="size-6" />} texto="Todavía no hay gastos fijos." />
      ) : (
        <Seccion titulo={`${data.fijos.filter((f) => f.activo && !f.terminado).length} activos · ${dinero(totalMes)} por mes`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="border-y border-borde bg-fondo">
                <tr>
                  <th className={TH}>Gasto</th>
                  <th className={TH}>Categoría</th>
                  <th className={TH}>Llega con</th>
                  <th className={cn(TH, 'text-right')}>Monto</th>
                  <th className={TH}>Vence</th>
                  <th className={TH}>Este mes</th>
                  <th className={TH} />
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {data.fijos.map((f) => (
                  <Fragment key={f.id}>
                  <tr className={cn(!f.activo && 'text-tinta-suave')}>
                    <td className={TD}>
                      <span className="font-medium">{f.nombre}</span>
                      <span className="block text-xs text-tinta-suave">
                        {[
                          f.proveedor,
                          f.camion,
                          f.equipos.length > 0 ? `${f.equipos.length} unidades: ${f.equipos.map((e) => e.patente).join(', ')}` : null,
                          f.cuotas !== null && f.cuotaActual !== null ? `${f.cuotaActual} de ${f.cuotas} cuotas pagadas${f.cuotas - f.cuotaActual > 0 ? ` · faltan ${f.cuotas - f.cuotaActual}` : ''}` : null,
                          f.atrasado ? 'con cuotas vencidas' : f.hasta ? `${f.terminado ? 'terminó' : 'hasta'} ${mesCorto(f.hasta)}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ') || ' '}
                      </span>
                    </td>
                    <td className={cn(TD, 'text-xs text-tinta-suave')}>{f.cuenta}</td>
                    <td className={cn(TD, 'text-xs')}>{etiquetaDocumento(f.tipoDocumento)}</td>
                    <td className={cn(TD, 'text-right tabular-nums')}>{dinero(f.monto, f.moneda)}</td>
                    <td className={cn(TD, 'tabular-nums')}>día {f.diaVence}</td>
                    <td className={TD}>
                      {!f.activo ? <Chip tono="neutro">Inactivo</Chip> : f.terminado ? <Chip tono="neutro">Terminado</Chip> : f.generadoMes ? <Chip tono="exito">Generado</Chip> : <Chip tono="alerta">Falta</Chip>}
                    </td>
                    <td className={cn(TD, 'text-right')}>
                      {puede && (
                        <button type="button" className={BOTON_ICONO} aria-label={`Cambiar ${f.nombre}`} onClick={() => setForm(editar(f))}>
                          <Pencil className="size-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                  {/* Las cuotas que falta pagar, con su vencimiento original: se pagan de a una o todas juntas */}
                  {f.cuotasSinPagar.map((c) => (
                    <tr key={c.gastoId} className="bg-fondo/40">
                      <td className={cn(TD, 'pl-8')} colSpan={3}>
                        <span className="font-medium">Cuota {c.cuota}</span>
                        <span className={cn('ml-2 text-xs', c.diasVencido > 0 ? 'text-error' : 'text-tinta-suave')}>
                          {c.diasVencido > 0 ? `venció el ${formatearFechaDia(c.vence)} (hace ${c.diasVencido} días)` : `vence el ${formatearFechaDia(c.vence)}`}
                        </span>
                        {c.pagoPrevisto && c.pagoPrevisto !== c.vence && <span className="ml-2 text-xs text-tinta-suave">· pago previsto: {formatearFechaDia(c.pagoPrevisto)}</span>}
                        {pagando === c.gastoId && (
                          <PagarGasto
                            gastoId={c.gastoId}
                            moneda={c.moneda}
                            saldo={c.saldo}
                            onListo={() => {
                              setPagando(null);
                              void refetch();
                            }}
                          />
                        )}
                      </td>
                      <td className={cn(TD, 'text-right align-top tabular-nums')}>{dinero(c.saldo, c.moneda)}</td>
                      <td className={cn(TD, 'align-top')} colSpan={3}>
                        {puedePagar && (
                          <button type="button" className={BOTON_SECUNDARIO} onClick={() => setPagando(pagando === c.gastoId ? null : c.gastoId)}>
                            {pagando === c.gastoId ? 'Cerrar' : 'Pagar'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Seccion>
      )}

      {data.porUnidad.length > 0 && (
        <Seccion titulo="Costo fijo por unidad este mes">
          <p className="-mt-2 text-xs text-tinta-suave">
            Lo que le toca a cada tractor y a cada semirremolque de los gastos fijos de este mes. Si un gasto cubre varias unidades, se reparte en partes iguales.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-y border-borde bg-fondo">
                <tr>
                  <th className={TH}>Unidad</th>
                  <th className={TH}>De qué</th>
                  <th className={cn(TH, 'text-right')}>Por mes</th>
                  <th className={cn(TH, 'text-right')}>USD por mes</th>
                  <th className={cn(TH, 'text-right')}>USD por día</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {data.porUnidad.map((u) => (
                  <tr key={`${u.tipo}-${u.id}`}>
                    <td className={TD}>
                      <span className="font-mono font-medium">{u.patente}</span>
                      <span className="ml-2 text-xs text-tinta-suave">{u.tipo === 'semi' ? 'semirremolque' : 'tractor'}</span>
                    </td>
                    <td className={cn(TD, 'text-xs text-tinta-suave')}>{u.de}</td>
                    <td className={cn(TD, 'text-right tabular-nums')}>{dinero(u.clpMes)}</td>
                    <td className={cn(TD, 'text-right tabular-nums')}>{u.usdMes ?? '—'}</td>
                    <td className={cn(TD, 'text-right tabular-nums')}>{u.usdDia ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Seccion>
      )}
    </div>
  );
}
