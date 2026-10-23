'use client';

import { useEffect, useState } from 'react';
import { Calculator, LoaderCircle, Plus, Trash2 } from 'lucide-react';
import { TD, TH, useEnvio } from '@/modules/catalogos/components/comun';
import { Cargando, Chip, Encabezado, ErrorBase, ErrorLectura } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { formatearFechaDia, formatearFechaHora, hoyEnZona } from '@/shared/lib/fechas';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { ETIQUETA_UNIDAD, usd, type Adicional, type Tarifario } from '../domain/ventas.types';
import {
  useEmpresas,
  useGuardarAdicional,
  useGuardarParametros,
  useGuardarTarifa,
  useQuitarTarifa,
  useRecalcularCostoKm,
  useTarifario,
} from '../queries/hooks';

/** Ventas › Tarifas y costos: el costo por km, el tarifario por ruta y los adicionales. */
export function TarifasVentasPantalla() {
  const { data, isLoading, isError, refetch } = useTarifario();
  if (isLoading) return <Cargando texto="Leyendo las tarifas…" />;
  if (isError || !data) return <ErrorLectura texto="No se pudieron leer las tarifas." onReintentar={() => void refetch()} />;
  return (
    <div className="space-y-5">
      <Encabezado titulo="Tarifas y costos" subtitulo="Ventas" />
      <Costos t={data} />
      <Tarifas t={data} />
      <Adicionales t={data} />
    </div>
  );
}

function Costos({ t }: { t: Tarifario }) {
  const puede = useCan('ventas.tarifas:editar');
  const recalcular = useRecalcularCostoKm();
  const guardar = useGuardarParametros();
  const envio = useEnvio();
  const k = t.costoKm;
  const [v, setV] = useState({ margen: '', validez: '', condiciones: '', manual: '' });
  const [ok, setOk] = useState(false);
  useEffect(() => {
    setV({
      margen: String(t.parametros.margenObjetivoPct),
      validez: String(t.parametros.validezDias),
      condiciones: t.parametros.condiciones,
      manual: t.parametros.costoKmManualUsd > 0 ? String(t.parametros.costoKmManualUsd).replace('.', ',') : '',
    });
  }, [t.parametros]);
  return (
    <section className={cn(TARJETA, 'space-y-3 p-4')}>
      <div>
        <h2 className="font-semibold text-tinta">Costo por km y cómo sugiere el precio</h2>
        <p className="text-sm text-tinta-suave">
          Costo de un viaje = km de la ruta × costo por km + canon del chofer de la línea. El costo por km sale de los viajes reales (combustible, costo fijo
          por km y gastos, sin el canon). Si una ruta no tiene tarifa, el cotizador sugiere el costo más el margen objetivo.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <p className="text-xs text-tinta-suave uppercase">Costo por km que se usa</p>
          <p className="text-2xl font-semibold tabular-nums text-tinta">
            {k?.costoKmUsd !== null && k?.costoKmUsd !== undefined ? `USD ${k.costoKmUsd.toLocaleString('es-AR', { maximumFractionDigits: 3 })}` : 'Sin calcular'}
          </p>
          <p className="text-xs text-tinta-suave">
            {k?.fuente === 'manual'
              ? 'Fijado a mano'
              : k?.fuente === 'viajes'
                ? `${k.viajes} viajes · ${k.km?.toLocaleString('es-AR')} km · del ${formatearFechaDia(k.desde)} al ${formatearFechaDia(k.hasta)}${k.calculadoEn ? ` · calculado ${formatearFechaHora(k.calculadoEn, 'America/Argentina/Mendoza')}` : ''}`
                : 'Tocá «Recalcular» o fijalo a mano'}
          </p>
        </div>
        {puede && (
          <button
            type="button"
            className={BOTON_SECUNDARIO}
            disabled={recalcular.isPending}
            onClick={() => void envio.enviar(recalcular.mutateAsync({}), () => undefined)}
          >
            {recalcular.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Calculator className="size-4" />} Recalcular con los viajes reales
          </button>
        )}
      </div>
      {puede && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo label="Costo por km a mano (USD; vacío = el calculado)">
            <input inputMode="decimal" value={v.manual} onChange={(e) => setV({ ...v, manual: e.target.value })} />
          </Campo>
          <Campo label="Margen objetivo (%)">
            <input inputMode="decimal" value={v.margen} onChange={(e) => setV({ ...v, margen: e.target.value })} />
          </Campo>
          <Campo label="Validez de una cotización (días)">
            <input inputMode="numeric" value={v.validez} onChange={(e) => setV({ ...v, validez: e.target.value })} />
          </Campo>
          <div className="sm:col-span-3">
            <Campo label="Condiciones generales (salen al pie de cada cotización nueva)">
              <textarea
                className="h-24 py-2"
                value={v.condiciones}
                placeholder="Ej.: forma de pago, qué incluye el flete, estadías, seguro…"
                onChange={(e) => setV({ ...v, condiciones: e.target.value })}
              />
            </Campo>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className={BOTON_PRIMARIO}
              disabled={guardar.isPending}
              onClick={() => {
                setOk(false);
                void envio.enviar(
                  guardar.mutateAsync({ margen: v.margen, validez: Number(v.validez) || 0, condiciones: v.condiciones, costoKmManual: v.manual || '0' }),
                  () => setOk(true),
                );
              }}
            >
              Guardar
            </button>
            {ok && <span className="text-sm text-exito">Guardado.</span>}
          </div>
        </div>
      )}
      <ErrorBase error={envio.error} />
    </section>
  );
}

function Tarifas({ t }: { t: Tarifario }) {
  const puede = useCan('ventas.tarifas:editar');
  const quitar = useQuitarTarifa();
  const envio = useEnvio();
  const [nueva, setNueva] = useState(false);
  const [verViejas, setVerViejas] = useState(false);
  const filas = t.tarifas.filter((x) => verViejas || x.vigente || x.vigenteDesde > new Date().toISOString().slice(0, 10));
  return (
    <section className={cn(TARJETA, 'space-y-3 p-4')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-tinta">Tarifario (USD)</h2>
          <p className="text-sm text-tinta-suave">
            Una tarifa general por ruta y, si a un cliente se le cobra distinto, la suya. Un aumento se carga con su fecha: lo anterior no cambia.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-tinta-suave">
            <input type="checkbox" className="size-4 accent-marca" checked={verViejas} onChange={(e) => setVerViejas(e.target.checked)} />
            Ver las anteriores
          </label>
          {puede && (
            <button type="button" className={BOTON_PRIMARIO} onClick={() => setNueva(!nueva)}>
              <Plus className="size-4" /> Nueva tarifa
            </button>
          )}
        </div>
      </div>
      {nueva && <FormTarifa t={t} onListo={() => setNueva(false)} />}
      <ErrorBase error={envio.error} />
      {filas.length === 0 ? (
        <p className="text-sm text-alerta">Todavía no hay tarifas. Empezá por las rutas que más se venden.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-sm">
            <thead>
              <tr className="border-b border-borde">
                <th className={TH}>Ruta</th>
                <th className={TH}>Para</th>
                <th className={TH}>Precio</th>
                <th className={TH}>Desde</th>
                <th className={cn(TH, 'text-right')}>Costo del viaje</th>
                <th className={TH} />
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {filas.map((x) => (
                <tr key={x.id} className={cn(!x.vigente && 'text-tinta-suave')}>
                  <td className={TD}>
                    {x.linea}
                    {x.tipoContenedor && <span className="block text-xs text-tinta-suave">Contenedor {x.tipoContenedor}</span>}
                  </td>
                  <td className={TD}>{x.cliente ?? <span className="text-tinta-suave">General</span>}</td>
                  <td className={cn(TD, 'font-medium tabular-nums')}>
                    {usd(x.precioUsd)} <span className="text-xs font-normal text-tinta-suave">{ETIQUETA_UNIDAD[x.unidad]}</span>
                  </td>
                  <td className={TD}>
                    {formatearFechaDia(x.vigenteDesde)} {x.vigente ? <Chip tono="exito">Vigente</Chip> : x.vigenteDesde > new Date().toISOString().slice(0, 10) ? <Chip tono="marca">Futura</Chip> : null}
                    {x.observacion && <span className="block text-xs text-tinta-suave">{x.observacion}</span>}
                  </td>
                  <td className={cn(TD, 'text-right tabular-nums')}>{x.costo?.costoUsd !== null && x.costo?.costoUsd !== undefined ? usd(x.costo.costoUsd) : <span className="text-xs text-tinta-suave">{x.costo?.falta ?? '—'}</span>}</td>
                  <td className={TD}>
                    {puede && (
                      <button
                        type="button"
                        aria-label="Quitar"
                        className="text-tinta-suave hover:text-error"
                        disabled={quitar.isPending}
                        onClick={() => void envio.enviar(quitar.mutateAsync({ id: x.id }), () => undefined)}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function FormTarifa({ t, onListo }: { t: Tarifario; onListo: () => void }) {
  const { zonaHoraria } = useSesion();
  const clientes = useEmpresas(null, 'clientes');
  const guardar = useGuardarTarifa();
  const envio = useEnvio();
  const [v, setV] = useState({ lineaId: '', clienteId: '', unidad: 'viaje' as 'viaje' | 'tonelada' | 'kilo', tipoContenedor: '', precioUsd: '', desde: hoyEnZona(zonaHoraria) as string, observacion: '' });
  return (
    <div className="grid gap-3 rounded-lg border border-borde bg-fondo/40 p-4 sm:grid-cols-4">
      <Campo label="Ruta" error={envio.campo('lineaId')}>
        <select value={v.lineaId} onChange={(e) => setV({ ...v, lineaId: e.target.value })}>
          <option value="">Elegí…</option>
          {t.lineas.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nombre}
            </option>
          ))}
        </select>
      </Campo>
      <Campo label="Para">
        <select value={v.clienteId} onChange={(e) => setV({ ...v, clienteId: e.target.value })}>
          <option value="">General (todos)</option>
          {(clientes.data ?? [])
            .filter((c) => c.clienteId)
            .map((c) => (
              <option key={c.id} value={c.clienteId ?? ''}>
                {c.nombre}
              </option>
            ))}
        </select>
      </Campo>
      <Campo label="Se cobra">
        <select value={v.unidad} onChange={(e) => setV({ ...v, unidad: e.target.value as typeof v.unidad })}>
          <option value="viaje">por viaje</option>
          <option value="tonelada">por tonelada</option>
          <option value="kilo">por kilo</option>
        </select>
      </Campo>
      <Campo label="Precio (USD)" error={envio.campo('precioUsd')}>
        <input inputMode="decimal" value={v.precioUsd} onChange={(e) => setV({ ...v, precioUsd: e.target.value })} />
      </Campo>
      <Campo label="Contenedor (opcional)">
        <input value={v.tipoContenedor} placeholder="Vacío = todos" onChange={(e) => setV({ ...v, tipoContenedor: e.target.value })} />
      </Campo>
      <Campo label="Rige desde" error={envio.campo('desde')}>
        <input type="date" value={v.desde} onChange={(e) => setV({ ...v, desde: e.target.value })} />
      </Campo>
      <Campo label="Nota">
        <input value={v.observacion} onChange={(e) => setV({ ...v, observacion: e.target.value })} />
      </Campo>
      <div className="flex items-end gap-2">
        <button
          type="button"
          className={BOTON_PRIMARIO}
          disabled={guardar.isPending}
          onClick={() =>
            void envio.enviar(
              guardar.mutateAsync({ ...v, lineaId: Number(v.lineaId) || 0, clienteId: v.clienteId ? Number(v.clienteId) : null }),
              onListo,
            )
          }
        >
          Guardar
        </button>
        <button type="button" className={BOTON_SECUNDARIO} onClick={onListo}>
          Cancelar
        </button>
      </div>
      <div className="sm:col-span-4">
        <ErrorBase error={envio.error} />
      </div>
    </div>
  );
}

function Adicionales({ t }: { t: Tarifario }) {
  const puede = useCan('ventas.tarifas:editar');
  const [nuevo, setNuevo] = useState(false);
  return (
    <section className={cn(TARJETA, 'space-y-3 p-4')}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-tinta">Adicionales</h2>
          <p className="text-sm text-tinta-suave">Cargos que se suman al flete. El precio es el sugerido: en cada cotización se puede cambiar.</p>
        </div>
        {puede && (
          <button type="button" className={BOTON_SECUNDARIO} onClick={() => setNuevo(!nuevo)}>
            <Plus className="size-4" /> Nuevo
          </button>
        )}
      </div>
      <div className="space-y-2">
        {nuevo && <FilaAdicional a={null} puede onListo={() => setNuevo(false)} />}
        {t.adicionales.map((a) => (
          <FilaAdicional key={a.codigo} a={a} puede={puede} />
        ))}
      </div>
    </section>
  );
}

function FilaAdicional({ a, puede, onListo }: { a: Adicional | null; puede: boolean; onListo?: () => void }) {
  const guardar = useGuardarAdicional();
  const envio = useEnvio();
  const [v, setV] = useState({
    nombre: a?.nombre ?? '',
    unidad: a?.unidad ?? ('fijo' as Adicional['unidad']),
    precioUsd: a?.precioUsd !== null && a?.precioUsd !== undefined ? String(a.precioUsd) : '',
    activo: a?.activo ?? true,
  });
  const [ok, setOk] = useState(false);
  return (
    <div className="grid items-end gap-2 sm:grid-cols-[minmax(12rem,2fr)_10rem_8rem_6rem_auto]">
      <Campo label="Nombre">
        <input value={v.nombre} disabled={!puede} onChange={(e) => setV({ ...v, nombre: e.target.value })} />
      </Campo>
      <Campo label="Se cobra">
        <select value={v.unidad} disabled={!puede} onChange={(e) => setV({ ...v, unidad: e.target.value as Adicional['unidad'] })}>
          <option value="fijo">fijo</option>
          <option value="por_dia">por día</option>
          <option value="por_hora">por hora</option>
          <option value="porcentaje">% del flete</option>
        </select>
      </Campo>
      <Campo label={v.unidad === 'porcentaje' ? '%' : 'Precio USD'}>
        <input inputMode="decimal" value={v.precioUsd} disabled={!puede} onChange={(e) => setV({ ...v, precioUsd: e.target.value })} />
      </Campo>
      <label className="flex h-10 items-center gap-1.5 text-sm">
        <input type="checkbox" className="size-4 accent-marca" checked={v.activo} disabled={!puede} onChange={(e) => setV({ ...v, activo: e.target.checked })} />
        Activo
      </label>
      {puede ? (
        <div className="flex h-10 items-center gap-2">
          <button
            type="button"
            className="text-sm font-medium text-marca hover:underline"
            disabled={guardar.isPending}
            onClick={() => {
              setOk(false);
              void envio.enviar(guardar.mutateAsync({ codigo: a?.codigo ?? null, ...v }), () => {
                setOk(true);
                onListo?.();
              });
            }}
          >
            Guardar
          </button>
          {ok && <span className="text-xs text-exito">✓</span>}
        </div>
      ) : (
        <span />
      )}
      {envio.error && (
        <div className="sm:col-span-5">
          <ErrorBase error={envio.error} />
        </div>
      )}
    </div>
  );
}
