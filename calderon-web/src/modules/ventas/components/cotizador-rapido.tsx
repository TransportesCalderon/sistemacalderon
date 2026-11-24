'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Calculator, ChevronDown, ChevronUp, LoaderCircle, Save, TriangleAlert } from 'lucide-react';
import { useUbicaciones } from '@/modules/catalogos/queries/hooks';
import { useCan } from '@/modules/core/permissions/can';
import { cn } from '@/shared/lib/cn';
import { formatearFechaDia } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { margenDe, type BaseCosto } from '../domain/cotizador';
import { usd } from '../domain/ventas.types';
import { useBaseCosto, useCotizador, useCotizarGuardar, useEmpresas, useGuardarBaseCosto } from '../queries/hooks';

const aNumero = (t: string): number | null => {
  const x = t.trim().replace(/\./g, '').replace(',', '.');
  if (x === '') return null;
  const v = Number(x);
  return Number.isFinite(v) ? v : null;
};
const km = (v: number | null) => (v === null ? '—' : `${formatearNumero(v, 0)} km`);
const porKm = (v: number | null) => (v === null ? '—' : `USD ${formatearNumero(v, 3)}`);
const mesCorto = (iso: string) => {
  const [a, m] = iso.split('-');
  return `${['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][Number(m) - 1] ?? m}-${a}`;
};

/**
 * Migración 305 · Cotizar un viaje en un paso: origen, destino y si vuelve vacío.
 * El precio sale del costo real por km (toda la contabilidad ÷ km de la flota) más el margen.
 */
export function CotizadorRapido() {
  const router = useRouter();
  const puedeGuardar = useCan('ventas.cotizaciones:editar');
  const lugares = useUbicaciones();
  const empresas = useEmpresas(null, null);
  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  const [lineaId, setLineaId] = useState<string>('');
  const [vacio, setVacio] = useState(false);
  const [regreso, setRegreso] = useState('');
  const [margenTxt, setMargenTxt] = useState('');
  const [precioTxt, setPrecioTxt] = useState('');
  const [empresaId, setEmpresaId] = useState('');
  const [empresaNombre, setEmpresaNombre] = useState('');
  const [viajesTxt, setViajesTxt] = useState('1');
  const [verBase, setVerBase] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const guardar = useCotizarGuardar();

  const margen = aNumero(margenTxt);
  const q = useCotizador({
    origenId: Number(origen) || null,
    destinoId: Number(destino) || null,
    lineaId: lineaId === '' || lineaId === 'mapa' ? null : Number(lineaId),
    vueltaVacia: vacio,
    regresoId: vacio && regreso ? Number(regreso) : null,
    margen,
    empresaId: Number(empresaId) || null,
  });
  const r = q.data;
  const listos = !!origen && !!destino && origen !== destino;
  const precioOfrecido = aNumero(precioTxt) ?? r?.precioUsd ?? null;
  const margenResultante = margenDe(precioOfrecido, r?.costoUsd ?? null);
  const ordenados = useMemo(() => [...(lugares.data ?? [])].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')), [lugares.data]);

  const opciones = (
    <>
      <option value="">Elegí…</option>
      {ordenados.map((u) => (
        <option key={u.id} value={u.id}>
          {u.nombre}
          {u.pais ? ` (${u.pais})` : ''}
        </option>
      ))}
    </>
  );

  return (
    <section className={cn(TARJETA, 'space-y-4 p-4')}>
      <h2 className="flex items-center gap-2 text-lg font-semibold text-tinta">
        <Calculator className="size-5 text-marca" /> Cotizar un viaje
      </h2>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <Campo label="Desde">
          <select
            value={origen}
            onChange={(e) => {
              setOrigen(e.target.value);
              setLineaId('');
              setPrecioTxt('');
            }}
          >
            {opciones}
          </select>
        </Campo>
        <Campo label="Hasta">
          <select
            value={destino}
            onChange={(e) => {
              setDestino(e.target.value);
              setLineaId('');
              setPrecioTxt('');
            }}
          >
            {opciones}
          </select>
        </Campo>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-tinta">
          <input type="checkbox" className="size-4 accent-marca" checked={vacio} onChange={(e) => { setVacio(e.target.checked); setPrecioTxt(''); }} /> Vuelve vacío
        </label>
      </div>

      {listos && r && r.rutas.length > 1 && (
        <Campo label="Por dónde va">
          <select value={lineaId === '' ? String(r.lineaId ?? '') : lineaId} onChange={(e) => { setLineaId(e.target.value); setPrecioTxt(''); }}>
            {r.rutas.map((x) => (
              <option key={x.id} value={x.id}>
                {x.codigo} · {km(x.km)}
              </option>
            ))}
            <option value="mapa">El camino más corto del mapa</option>
          </select>
        </Campo>
      )}
      {vacio && (
        <Campo label="Vuelve vacío hasta">
          <select value={regreso} onChange={(e) => { setRegreso(e.target.value); setPrecioTxt(''); }}>
            <option value="">{r?.origen ? `${r.origen} (el origen)` : 'El origen'}</option>
            {ordenados.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
              </option>
            ))}
          </select>
        </Campo>
      )}

      {!listos ? (
        <p className="text-sm text-tinta-suave">Elegí desde dónde y hasta dónde: el sistema calcula los km, el costo y el precio.</p>
      ) : q.isPending ? (
        <p className="flex items-center gap-2 text-sm text-tinta-suave">
          <LoaderCircle className="size-4 animate-spin" /> Calculando…
        </p>
      ) : q.isError ? (
        <p className="text-sm text-error">{q.error.message}</p>
      ) : r ? (
        <div className="space-y-4">
          {r.falta && (
            <p className="flex items-start gap-2 rounded-md bg-alerta-suave px-3 py-2 text-sm text-alerta">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {r.falta}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-borde p-3">
              <p className="text-xs text-tinta-suave">Precio sugerido (margen {formatearNumero(r.margenPct, 0)} %)</p>
              <p className="text-3xl font-semibold tabular-nums text-tinta">{usd(r.precioUsd)}</p>
              <p className="text-sm text-tinta-suave">
                {porKm(r.precioKmCargadoUsd)} por km cargado
                {r.kmVacio > 0 && ` · ${porKm(r.precioKmUsd)} por km recorrido`}
              </p>
            </div>
            <div className="rounded-lg border border-borde p-3 text-sm">
              <p className="text-xs text-tinta-suave">Kilómetros</p>
              <p className="text-tinta">
                Cargado: <strong>{km(r.kmCargado)}</strong> {r.fuenteKm === 'ruta' ? `(ruta ${r.ruta})` : r.fuenteKm === 'mapa' ? '(del mapa)' : ''}
              </p>
              {r.kmVacio > 0 && (
                <p className="text-tinta">
                  Vacío hasta {r.regreso}: <strong>{km(r.kmVacio)}</strong>
                </p>
              )}
              <p className="text-tinta">Total: {km(r.kmTotal)}</p>
            </div>
            <div className="rounded-lg border border-borde p-3 text-sm">
              <p className="text-xs text-tinta-suave">Costo real</p>
              <p className="text-tinta">
                <strong>{porKm(r.costoKmUsd)}</strong> por km × {km(r.kmTotal)} = <strong>{usd(r.costoUsd)}</strong>
              </p>
              <p className="text-xs text-tinta-suave">
                {r.fuenteCosto === 'contable'
                  ? `Todos los costos y gastos cargados ${r.costoDesde ? `de ${mesCorto(r.costoDesde)}` : ''}${r.costoHasta && r.costoDesde && r.costoHasta.slice(0, 7) !== r.costoDesde.slice(0, 7) ? ` a ${mesCorto(r.costoHasta)}` : ''} ÷ los km de toda la flota.`
                  : r.fuenteCosto === 'manual'
                    ? 'Costo por km cargado a mano (no hay meses con costos y km completos).'
                    : r.fuenteCosto === 'viajes'
                      ? 'Costo de los viajes cerrados (no hay meses con costos y km completos).'
                      : ''}{' '}
                <button type="button" className="text-marca hover:underline" onClick={() => setVerBase((v) => !v)}>
                  {verBase ? 'Ocultar el detalle' : 'Ver de dónde sale'}
                </button>
              </p>
              {r.tarifaVigenteUsd !== null && (
                <p className="mt-1 text-xs text-tinta-suave">
                  Tarifa vigente {r.tarifaDe === 'cliente' ? 'de este cliente' : 'general'}: {usd(r.tarifaVigenteUsd)}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[8rem_10rem_1fr]">
            <Campo label="Margen %">
              <input inputMode="decimal" placeholder={String(r.margenPct)} value={margenTxt} onChange={(e) => { setMargenTxt(e.target.value); setPrecioTxt(''); }} />
            </Campo>
            <Campo label="Precio a ofrecer (USD)">
              <input inputMode="decimal" placeholder={r.precioUsd !== null ? String(r.precioUsd) : ''} value={precioTxt} onChange={(e) => setPrecioTxt(e.target.value)} />
            </Campo>
            <p className="self-end pb-2 text-sm text-tinta">
              {precioOfrecido !== null && r.costoUsd !== null && (
                <>
                  Ganancia: <strong>{usd(Math.round(precioOfrecido - r.costoUsd))}</strong> ·{' '}
                  <span className={cn(margenResultante !== null && margenResultante < 8 ? 'text-error' : margenResultante !== null && margenResultante < 12 ? 'text-alerta' : 'text-exito')}>
                    margen {formatearNumero(margenResultante, 1)} %
                  </span>
                  {r.kmCargado ? ` · ${porKm(precioOfrecido / r.kmCargado)} por km cargado` : ''}
                </>
              )}
            </p>
          </div>

          {puedeGuardar && (
            <div className="space-y-2 rounded-lg border border-borde bg-fondo/40 p-3">
              <p className="text-sm font-medium text-tinta">Guardar como cotización para el cliente (con su PDF)</p>
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_6rem_auto]">
                <Campo label="Empresa">
                  <select value={empresaId} onChange={(e) => setEmpresaId(e.target.value)}>
                    <option value="">Otra (escribila al lado)</option>
                    {(empresas.data ?? [])
                      .filter((e) => !e.descartada)
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.nombre}
                          {e.clienteId ? '' : ' (prospecto)'}
                        </option>
                      ))}
                  </select>
                </Campo>
                <Campo label="Nombre (si es nueva)">
                  <input value={empresaNombre} disabled={!!empresaId} maxLength={150} onChange={(e) => setEmpresaNombre(e.target.value)} />
                </Campo>
                <Campo label="Viajes">
                  <input inputMode="decimal" value={viajesTxt} onChange={(e) => setViajesTxt(e.target.value)} />
                </Campo>
                <button
                  type="button"
                  className={cn(BOTON_PRIMARIO, 'self-end')}
                  disabled={guardar.isPending || precioOfrecido === null || (r.kmCargado === null && r.lineaId === null)}
                  onClick={async () => {
                    setError(null);
                    const res = await guardar.mutateAsync({
                      empresaId: Number(empresaId) || null,
                      empresaNombre,
                      origenId: Number(origen),
                      destinoId: Number(destino),
                      lineaId: lineaId === 'mapa' ? null : lineaId ? Number(lineaId) : r.fuenteKm === 'ruta' ? r.lineaId : null,
                      vueltaVacia: vacio,
                      precioUsd: precioOfrecido ?? 0,
                      viajes: aNumero(viajesTxt) ?? 1,
                      observacion: `Cotizador: costo ${usd(r.costoUsd)} (${porKm(r.costoKmUsd)}/km, ${km(r.kmTotal)}), margen ${formatearNumero(margenResultante, 1)} %.`,
                    });
                    if (!res.ok) return setError(res.error.mensaje);
                    router.push(`/cotizaciones/${res.data}`);
                  }}
                >
                  {guardar.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />} Guardar
                </button>
              </div>
              {error && <p className="text-sm text-error">{error}</p>}
            </div>
          )}
        </div>
      ) : null}

      {verBase && <DetalleBase puedeCambiar={puedeGuardar} />}
      {!verBase && (
        <button type="button" className="inline-flex items-center gap-1 text-xs text-tinta-suave hover:underline" onClick={() => setVerBase(true)}>
          <ChevronDown className="size-3" /> De dónde sale el costo por km
        </button>
      )}
    </section>
  );
}

/** El detalle del costo por km: meses, cuentas que más pesan, control del combustible y la base (Gerencia la puede cambiar). */
function DetalleBase({ puedeCambiar }: { puedeCambiar: boolean }) {
  const q = useBaseCosto(true);
  if (q.isPending) return <p className="text-sm text-tinta-suave">Leyendo los costos…</p>;
  if (q.isError) return <p className="text-sm text-error">{q.error.message}</p>;
  return <Base b={q.data} puedeCambiar={puedeCambiar} />;
}

function Base({ b, puedeCambiar }: { b: BaseCosto; puedeCambiar: boolean }) {
  const cambiar = useGuardarBaseCosto();
  const [meses, setMeses] = useState(b.mesesPedidos);
  const [hastaHoy, setHastaHoy] = useState(b.hastaHoy);
  const [cargas, setCargas] = useState(b.combustibleDeCargas);
  const [error, setError] = useState<string | null>(null);
  const distinto = meses !== b.mesesPedidos || hastaHoy !== b.hastaHoy || cargas !== b.combustibleDeCargas;
  const faltaCombustible =
    !b.combustibleDeCargas && b.combustibleCargasUsd !== null && b.combustibleContableUsd !== null && b.combustibleContableUsd < b.combustibleCargasUsd * 0.8;
  return (
    <div className="space-y-3 rounded-lg border border-borde p-3 text-sm">
      <p className="flex items-center gap-1 font-medium text-tinta">
        <ChevronUp className="size-4" /> Costo por km: {porKm(b.costoKmUsd)} ({usd(b.costoUsd)} ÷ {km(b.km)})
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-tinta-suave">
            <tr>
              <th className="py-1 pr-3">Mes</th>
              <th className="py-1 pr-3 text-right">Costos</th>
              <th className="py-1 pr-3 text-right">Km de la flota</th>
              <th className="py-1 pr-3 text-right">Camiones</th>
              <th className="py-1 pr-3 text-right">Costo por km</th>
              <th className="py-1 pr-3 text-right">Combustible (contab. / cargas)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde tabular-nums">
            {b.meses.map((m) => (
              <tr key={m.mes} className={cn(!m.usado && 'text-tinta-suave')}>
                <td className="py-1 pr-3">
                  {mesCorto(m.mes)}
                  {m.hasta && m.hasta.slice(8) !== '31' && m.hasta.slice(8) !== '30' && m.hasta.slice(5, 7) !== '02' ? ` (al ${formatearFechaDia(m.hasta)})` : ''}
                  {!m.usado && ' · no se usa'}
                </td>
                <td className="py-1 pr-3 text-right">{usd(m.costoUsd)}</td>
                <td className="py-1 pr-3 text-right">{km(m.km)}</td>
                <td className="py-1 pr-3 text-right">{m.camiones}</td>
                <td className="py-1 pr-3 text-right">{porKm(m.costoKmUsd)}</td>
                <td className="py-1 pr-3 text-right">
                  {usd(m.combustibleUsd)} / {usd(m.cargasUsd)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {faltaCombustible && (
        <p className="flex items-start gap-2 rounded-md bg-alerta-suave px-3 py-2 text-alerta">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" /> La contabilidad tiene menos combustible que las cargas del período: el costo por km sale bajo. Conviene tomar el combustible de las cargas.
        </p>
      )}
      {b.camionesSinKm.length > 0 && (
        <p className="text-alerta">
          Camiones sin km en el período: {b.camionesSinKm.join(', ')}. Si anduvieron, faltan sus km y el costo por km sale alto.
        </p>
      )}
      {b.kmDeCierres !== null && b.kmDeCierres > 0 && <p className="text-tinta-suave">{km(b.kmDeCierres)} salen de los cierres de viaje (camiones sin telemetría).</p>}
      <div>
        <p className="text-xs text-tinta-suave">Lo que más pesa</p>
        <ul className="grid gap-x-6 sm:grid-cols-2">
          {b.cuentas.map((c) => (
            <li key={c.codigo + c.nombre} className="flex justify-between gap-2 border-b border-borde py-0.5">
              <span className="text-tinta">{c.nombre}</span>
              <span className="tabular-nums text-tinta-suave">
                {usd(c.usd)} · {formatearNumero(c.pct, 1)} %
              </span>
            </li>
          ))}
        </ul>
        {b.cuentasFuera.length > 0 && <p className="mt-1 text-xs text-tinta-suave">Quedan afuera las cuentas {b.cuentasFuera.join(', ')} (no son costo del servicio).</p>}
      </div>
      {puedeCambiar && (
        <div className="flex flex-wrap items-end gap-3 border-t border-borde pt-3">
          <Campo label="Meses que se promedian">
            <select value={meses} onChange={(e) => setMeses(Number(e.target.value))}>
              {[1, 2, 3, 4, 6, 12].map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </Campo>
          <label className="flex items-center gap-2 pb-2 text-tinta">
            <input type="checkbox" className="size-4 accent-marca" checked={hastaHoy} onChange={(e) => setHastaHoy(e.target.checked)} /> Incluir este mes hasta ayer
          </label>
          <label className="flex items-center gap-2 pb-2 text-tinta">
            <input type="checkbox" className="size-4 accent-marca" checked={cargas} onChange={(e) => setCargas(e.target.checked)} /> Combustible de las cargas
          </label>
          <button
            type="button"
            className={BOTON_SECUNDARIO}
            disabled={!distinto || cambiar.isPending}
            onClick={async () => {
              setError(null);
              const r = await cambiar.mutateAsync({ meses, hastaHoy, combustibleDeCargas: cargas });
              if (!r.ok) setError(r.error.mensaje);
            }}
          >
            {cambiar.isPending && <LoaderCircle className="size-4 animate-spin" />} Usar esta base
          </button>
          {error && <p className="text-error">{error}</p>}
        </div>
      )}
    </div>
  );
}
