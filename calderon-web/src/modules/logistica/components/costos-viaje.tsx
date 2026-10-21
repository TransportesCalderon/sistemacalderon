'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useForm, type Path } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Calculator, LoaderCircle, Plus, Receipt, Trash2 } from 'lucide-react';
import { TD, TH } from '@/modules/catalogos/components/comun';
import { AccionConMotivo, Cargando, Chip, Dato, Encabezado, ErrorBase, ErrorLectura, Seccion, Vacio } from '@/modules/combustible/components/comun/ui';
import { Cifra, FiltroPeriodo, usePeriodo } from '@/modules/combustible/components/consumo/periodo';
import { useMonedas } from '@/modules/combustible/queries/hooks';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import type { ErrorAccion } from '@/server/actions/result';
import { cn } from '@/shared/lib/cn';
import { formatearFechaDia, formatearFechaHora, hoyEnZona } from '@/shared/lib/fechas';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { gastoViajeFormSchema, type GastoViajeFormEntrada } from '../domain/costos.schemas';
import type { CostosViaje as Costos, GastoViaje } from '../domain/costos.types';
import type { ViajeChofer } from '../domain/viaje-chofer.types';
import { useAgregarGastoViaje, useAnularGastoViaje, useCategoriasGasto, useCostosViaje, useCostosViajes } from '../queries/hooks';
import { formatoImporte, formatoNumero } from './viaje-chofer-comun';

type SalidaGasto = ReturnType<typeof gastoViajeFormSchema.parse>;

/**
 * Ficha del viaje > Km y costos (migración 51): km reales de la telemetría (los de la línea son los
 * que se liquidan), combustible, canon, costo fijo por km y gastos a mano. Lo calcula la base.
 */
export function CostosViaje({ viaje }: { viaje: ViajeChofer }) {
  const ver = useCan('finanzas.costos_directos:ver');
  const { data: c, isPending, isError, refetch } = useCostosViaje(viaje.id, ver);
  if (!ver) return null;
  return (
    <Seccion titulo="Km y costos">
      {isPending ? (
        <Cargando texto="Calculando…" />
      ) : isError ? (
        <ErrorLectura texto="No se pudieron calcular los costos." onReintentar={() => refetch()} />
      ) : (
        <ContenidoCostos c={c} viaje={viaje} />
      )}
    </Seccion>
  );
}

function ContenidoCostos({ c, viaje }: { c: Costos; viaje: ViajeChofer }) {
  const imp = (v: number | null) => formatoImporte(c.moneda, v);
  return (
    <div className="space-y-5">
      {c.enCurso && <p className="text-sm text-alerta">El viaje sigue en curso: los números son hasta ahora.</p>}
      <dl className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Dato etiqueta="Km de la línea (se liquidan)">{formatoNumero(c.kmLinea)}</Dato>
        <Dato etiqueta="Km reales (telemetría)">{c.kmReales === null ? <span className="text-tinta-suave">Sin datos</span> : formatoNumero(c.kmReales)}</Dato>
        <Dato etiqueta="Litros del motor">{c.litrosMotor === null ? '—' : `${formatoNumero(c.litrosMotor)} L`}</Dato>
        <Dato etiqueta="Consumo">{c.l100km === null ? '—' : `${formatoNumero(c.l100km, 1)} L/100 km`}</Dato>
        <Dato etiqueta="Horas de motor">{c.horasMotor === null ? '—' : `${formatoNumero(c.horasMotor, 1)} h`}</Dato>
      </dl>
      <div className="overflow-x-auto">
        <table className="w-full max-w-2xl text-sm">
          <tbody className="divide-y divide-borde">
            <tr>
              <td className={TD}>
                Combustible
                <span className="block text-xs text-tinta-suave">
                  {c.litrosCargados === null ? 'Sin cargas en el viaje' : `${formatoNumero(c.litrosCargados)} L cargados`}
                  {c.combustibleEstimado && ' · alguna carga sin importe: se usó el precio promedio del mes'}
                </span>
              </td>
              <td className={cn(TD, 'text-right tabular-nums')}>{imp(c.combustible)}</td>
            </tr>
            <tr>
              <td className={TD}>
                Canon del chofer
                {c.canonSinCotizacion > 0 && <span className="block text-xs text-alerta">{c.canonSinCotizacion} canon sin cotización del día: no se suma</span>}
              </td>
              <td className={cn(TD, 'text-right tabular-nums')}>{imp(c.canon)}</td>
            </tr>
            <tr>
              <td className={TD}>
                Costo por km
                <span className="block text-xs text-tinta-suave">
                  {c.costoKmFijo === null
                    ? 'Sin cargar: Configuración › Parámetros › ops.costo_km_fijo'
                    : `${formatoNumero(c.fuenteKm === 'telemetria' ? c.kmReales : c.kmLinea)} km ${c.fuenteKm === 'telemetria' ? 'reales' : 'de la línea'} × ${imp(c.costoKmFijo)}`}
                </span>
              </td>
              <td className={cn(TD, 'text-right tabular-nums')}>{imp(c.costoKm)}</td>
            </tr>
            <tr>
              <td className={TD}>Gastos (peajes, viáticos, otros)</td>
              <td className={cn(TD, 'text-right tabular-nums')}>{imp(c.gastos)}</td>
            </tr>
            <tr className="font-semibold">
              <td className={TD}>Total</td>
              <td className={cn(TD, 'text-right tabular-nums')}>{imp(c.total)}</td>
            </tr>
            <tr className="text-tinta-suave">
              <td className={TD}>Por km · por operación</td>
              <td className={cn(TD, 'text-right tabular-nums')}>
                {imp(c.porKm)} · {imp(c.porOperacion)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <Gastos c={c} viaje={viaje} />
    </div>
  );
}

function Gastos({ c, viaje }: { c: Costos; viaje: ViajeChofer }) {
  const puede = useCan('finanzas.costos_directos:editar');
  const [agregar, setAgregar] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-tinta">Gastos del viaje</h3>
        {puede && !agregar && (
          <button type="button" className={BOTON_SECUNDARIO} onClick={() => setAgregar(true)}>
            <Plus className="size-4" /> Agregar gasto
          </button>
        )}
      </div>
      {agregar && <GastoForm viaje={viaje} onListo={() => setAgregar(false)} />}
      {c.gastosDetalle.length === 0 ? (
        <p className="text-sm text-tinta-suave">Sin gastos cargados.</p>
      ) : (
        <ul className="divide-y divide-borde text-sm">
          {c.gastosDetalle.map((g) => (
            <FilaGasto key={g.id} g={g} viajeId={viaje.id} puede={puede} monedaBase={c.moneda} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FilaGasto({ g, viajeId, puede, monedaBase }: { g: GastoViaje; viajeId: number; puede: boolean; monedaBase: string }) {
  const anular = useAnularGastoViaje();
  const [error, setError] = useState<ErrorAccion | null>(null);
  return (
    <li className={cn('flex flex-wrap items-start justify-between gap-3 py-2', g.anulado && 'opacity-60')}>
      <div>
        <span className={cn('font-medium text-tinta', g.anulado && 'line-through')}>{g.categoria}</span>
        <span className="text-tinta-suave"> · {formatearFechaDia(g.fecha)}</span>
        {g.documento && <span className="text-tinta-suave"> · {g.documento}</span>}
        {g.observacion && <span className="block text-xs text-tinta-suave">{g.observacion}</span>}
        {g.anulado && <span className="block text-xs text-tinta-suave">Anulado: {g.motivoAnulacion}</span>}
      </div>
      <div className="flex items-start gap-3">
        <div className="text-right tabular-nums">
          {formatoImporte(g.moneda, g.importe)}
          {g.moneda !== monedaBase && g.importeBase !== null && <span className="block text-xs text-tinta-suave">{formatoImporte(monedaBase, g.importeBase)}</span>}
        </div>
        {puede && !g.anulado && (
          <AccionConMotivo
            etiqueta="Anular"
            icono={<Trash2 className="size-3.5" />}
            titulo="Anular el gasto"
            ocupado={anular.isPending}
            error={error}
            onConfirmar={async (motivo) => {
              setError(null);
              const r = await anular.mutateAsync({ gastoId: g.id, viajeId, motivo });
              if (!r.ok) setError(r.error);
              return r.ok;
            }}
          />
        )}
      </div>
    </li>
  );
}

function GastoForm({ viaje, onListo }: { viaje: ViajeChofer; onListo: () => void }) {
  const { zonaHoraria, monedaBase } = useSesion();
  const { data: categorias } = useCategoriasGasto();
  const { data: monedas } = useMonedas();
  const agregar = useAgregarGastoViaje();
  const [error, setError] = useState<ErrorAccion | null>(null);
  const form = useForm<GastoViajeFormEntrada, unknown, SalidaGasto>({
    resolver: zodResolver(gastoViajeFormSchema),
    defaultValues: { categoria: 'PEAJE', fecha: hoyEnZona(zonaHoraria), importe: '', moneda: monedaBase ?? '', documento: '', observacion: '' },
    mode: 'onTouched',
  });
  const { register, handleSubmit, formState } = form;
  const e = formState.errors;
  // Las opciones llegan después: se vuelven a aplicar los valores iniciales para que el select los muestre
  useEffect(() => {
    if (categorias && monedas) form.reset(form.formState.defaultValues, { keepDirtyValues: true });
  }, [categorias, monedas, form]);

  const enviar = handleSubmit(async (d) => {
    setError(null);
    const r = await agregar.mutateAsync({ viajeId: viaje.id, ...d, importe: d.importe ?? 0 });
    if (!r.ok) {
      setError(r.error);
      for (const [campo, mensaje] of Object.entries(r.error.campos ?? {})) form.setError(campo as Path<GastoViajeFormEntrada>, { type: 'server', message: mensaje });
      return;
    }
    onListo();
  });

  return (
    <form onSubmit={enviar} noValidate className="space-y-3 rounded-lg border border-borde p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Campo label="Qué gasto" error={e.categoria?.message}>
          <select {...register('categoria')}>
            {categorias?.map((c) => (
              <option key={c.codigo} value={c.codigo}>
                {c.nombre}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Fecha" error={e.fecha?.message}>
          <input type="date" {...register('fecha')} />
        </Campo>
        <Campo label="Importe" error={e.importe?.message}>
          <input inputMode="decimal" {...register('importe')} />
        </Campo>
        <Campo label="Moneda" error={e.moneda?.message}>
          <select {...register('moneda')}>
            {monedas?.map((m) => (
              <option key={m.codigo} value={m.codigo}>
                {m.codigo}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Comprobante (opcional)" error={e.documento?.message}>
          <input {...register('documento')} />
        </Campo>
        <div className="sm:col-span-1 lg:col-span-3">
          <Campo label="Detalle (opcional)" error={e.observacion?.message}>
            <input {...register('observacion')} />
          </Campo>
        </div>
      </div>
      <ErrorBase error={error} />
      <div className="flex flex-wrap gap-3">
        <button type="submit" className={BOTON_PRIMARIO} disabled={agregar.isPending}>
          {agregar.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Receipt className="size-4" />} Guardar gasto
        </button>
        <button type="button" className={BOTON_SECUNDARIO} onClick={onListo} disabled={agregar.isPending}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

/**
 * Logística > Costos de viajes (migración 51): costo de cada viaje de chofer que salió en el
 * período, en moneda base. Lo calcula la base (ops.fn_costos_viajes).
 */
export function CostosViajesPantalla() {
  const { zonaHoraria } = useSesion();
  const [p, setP] = usePeriodo('/operacion/costos');
  const { data, isPending, isError, error, isFetching, refetch } = useCostosViajes(p.desde, p.hasta);
  const moneda = data?.[0]?.moneda ?? '';
  const total = (data ?? []).reduce((a, f) => a + f.total, 0);
  const km = (data ?? []).reduce((a, f) => a + (f.kmReales ?? f.kmLinea ?? 0), 0);
  const imp = (v: number | null) => formatoImporte(moneda, v);

  return (
    <div className="space-y-5">
      <Encabezado titulo="Costos de viajes" subtitulo="Logística" />
      <p className="max-w-3xl text-sm text-tinta-suave">
        Por viaje de chofer: combustible de las cargas, canon, km reales × costo fijo por km (Configuración › Parámetros) y los gastos cargados en el
        viaje. Los km de la línea son los que se liquidan; los reales salen de la telemetría.
      </p>
      <FiltroPeriodo p={p} onCambiar={setP} />
      {isPending ? (
        <Cargando texto="Calculando…" />
      ) : isError ? (
        <ErrorLectura texto={error instanceof Error ? error.message : 'No se pudieron calcular los costos.'} onReintentar={() => refetch()} />
      ) : data.length === 0 ? (
        <Vacio icono={<Calculator className="size-6" />} texto="No hay viajes de chofer que hayan salido en el período." />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Cifra etiqueta="Viajes" valor={String(data.length)} />
            <Cifra etiqueta="Costo total" valor={imp(total)} />
            <Cifra etiqueta="Costo por km" valor={km > 0 ? imp(total / km) : '—'} />
          </div>
          <section className="overflow-hidden rounded-xl border border-borde bg-panel">
            <div className="overflow-x-auto">
              <table className={cn('w-full min-w-[1100px] text-sm', isFetching && 'opacity-70')}>
                <thead className="border-b border-borde bg-fondo">
                  <tr>
                    <th className={TH}>Viaje</th>
                    <th className={TH}>Chofer y tractor</th>
                    <th className={cn(TH, 'text-right')}>Km línea</th>
                    <th className={cn(TH, 'text-right')}>Km reales</th>
                    <th className={cn(TH, 'text-right')}>Combustible</th>
                    <th className={cn(TH, 'text-right')}>Canon</th>
                    <th className={cn(TH, 'text-right')}>Por km</th>
                    <th className={cn(TH, 'text-right')}>Gastos</th>
                    <th className={cn(TH, 'text-right')}>Total</th>
                    <th className={cn(TH, 'text-right')}>Costo/km</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borde">
                  {data.map((f) => (
                    <tr key={f.viajeId}>
                      <td className={TD}>
                        <Link className="font-mono text-marca hover:underline" href={`/operacion/viajes-chofer/${f.viajeId}`}>
                          {f.numero}
                        </Link>
                        <span className="block text-xs text-tinta-suave">{formatearFechaHora(f.salida, zonaHoraria)}</span>
                        <span className="mt-0.5 flex gap-1">
                          {f.enCurso && <Chip tono="marca">En curso</Chip>}
                          {f.incompleto && (
                            <Chip tono="alerta" title="Sin telemetría, combustible estimado o canon sin cotización">
                              Revisar
                            </Chip>
                          )}
                        </span>
                      </td>
                      <td className={TD}>
                        {f.chofer}
                        <span className="block font-mono text-xs text-tinta-suave">{f.patente}</span>
                      </td>
                      <td className={cn(TD, 'text-right tabular-nums')}>{formatoNumero(f.kmLinea)}</td>
                      <td className={cn(TD, 'text-right tabular-nums')}>{formatoNumero(f.kmReales)}</td>
                      <td className={cn(TD, 'text-right tabular-nums')}>{imp(f.combustible)}</td>
                      <td className={cn(TD, 'text-right tabular-nums')}>{imp(f.canon)}</td>
                      <td className={cn(TD, 'text-right tabular-nums')}>{imp(f.costoKm)}</td>
                      <td className={cn(TD, 'text-right tabular-nums')}>{imp(f.gastos)}</td>
                      <td className={cn(TD, 'text-right font-semibold tabular-nums')}>{imp(f.total)}</td>
                      <td className={cn(TD, 'text-right tabular-nums')}>{imp(f.porKm)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
