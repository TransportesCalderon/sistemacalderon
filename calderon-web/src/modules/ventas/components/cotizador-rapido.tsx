'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Calculator, ChevronDown, ChevronUp, LoaderCircle, Pin, Save, TriangleAlert } from 'lucide-react';
import { useUbicaciones } from '@/modules/catalogos/queries/hooks';
import { useCan } from '@/modules/core/permissions/can';
import { cn } from '@/shared/lib/cn';
import { formatearNumero } from '@/shared/lib/numeros';
import { BOTON_PRIMARIO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { leerNumero as aNumero, margenDe, nombreTramo, type OpcionesCotizador, type TipoTramo, type TramoViaje } from '../domain/cotizador';
import { usd } from '../domain/ventas.types';
import { useCotizador, useCotizarGuardar, useEmpresas, useGuardarTramoEstandar } from '../queries/hooks';
import { BaseDelCotizador } from './cotizador-base';

const entero = (v: number | null) => (v === null ? '—' : usd(Math.round(v)));
const km = (v: number | null) => (v === null ? '—' : `${formatearNumero(v, 0)} km`);
const dias = (v: number | null) => (v === null ? '—' : `${formatearNumero(v, v % 1 === 0 ? 0 : 1)} ${v === 1 ? 'día' : 'días'}`);
const porKm = (v: number | null) => (v === null ? '—' : `USD ${formatearNumero(v, 2)}`);
const FUENTE_KM: Record<string, string> = { a_mano: 'a mano', estandar: 'estándar', ruta: 'de la ruta', mapa: 'del mapa', recta: 'estimado' };
const FUENTE_DIAS: Record<string, string> = { a_mano: 'a mano', estandar: 'estándar', estimado: 'estimado' };
type Ajuste = `${'km' | 'dias'}_${TipoTramo}`;

/**
 * Migración 308 · Cotizar un viaje como en las presentaciones: el viaje tramo por tramo (vacío hasta el origen,
 * cargado y vacío hasta la base) con gasoil, días de camión y chofer, peajes y neumáticos. Los km y los días se
 * pueden cambiar y guardar como estándar del tramo. El margen es sobre el precio.
 */
export function CotizadorRapido() {
  const router = useRouter();
  const puedeGuardar = useCan('ventas.cotizaciones:editar');
  const lugares = useUbicaciones();
  const empresas = useEmpresas(null, null);
  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  const [ruta, setRuta] = useState('');
  const [vacioDesde, setVacioDesde] = useState('');
  const [vacioHasta, setVacioHasta] = useState('');
  const [ajustes, setAjustes] = useState<Partial<Record<Ajuste, number>>>({});
  const [margenTxt, setMargenTxt] = useState('');
  const [precioTxt, setPrecioTxt] = useState('');
  const [empresaId, setEmpresaId] = useState('');
  const [empresaNombre, setEmpresaNombre] = useState('');
  const [viajesTxt, setViajesTxt] = useState('1');
  const [verBase, setVerBase] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const guardar = useCotizarGuardar();
  const guardarTramo = useGuardarTramoEstandar();

  const opciones: Omit<OpcionesCotizador, 'origenId' | 'destinoId'> = {
    lineaId: ruta === '' ? null : Number(ruta),
    vacioDesde: vacioDesde === '' ? null : Number(vacioDesde),
    vacioHasta: vacioHasta === '' ? null : Number(vacioHasta),
    ajustes,
    margen: aNumero(margenTxt),
    empresaId: Number(empresaId) || null,
  };
  const q = useCotizador({ ...opciones, origenId: Number(origen) || null, destinoId: Number(destino) || null });
  const r = q.data;
  const listos = !!origen && !!destino && origen !== destino;
  const precioOfrecido = aNumero(precioTxt) ?? r?.precioUsd ?? null;
  const margenResultante = margenDe(precioOfrecido, r?.costoUsd ?? null);
  const ordenados = useMemo(() => [...(lugares.data ?? [])].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')), [lugares.data]);
  // Cambiar un lugar o la ruta cambia los tramos: los km y días a mano dejan de valer
  const cambiarViaje = (f: () => void) => {
    f();
    setAjustes({});
    setPrecioTxt('');
  };
  const ajustar = (clave: Ajuste, v: number | null) => {
    setAjustes((a) => {
      const b = { ...a };
      if (v === null) delete b[clave];
      else b[clave] = v;
      return b;
    });
    setPrecioTxt('');
  };

  const lista = ordenados.map((u) => (
    <option key={u.id} value={u.id}>
      {u.nombre}
      {u.pais ? ` (${u.pais})` : ''}
    </option>
  ));

  return (
    <section className={cn(TARJETA, 'space-y-4 p-4')}>
      <h2 className="flex items-center gap-2 text-lg font-semibold text-tinta">
        <Calculator className="size-5 text-marca" /> Cotizar un viaje
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo label="Desde">
          <select value={origen} onChange={(e) => cambiarViaje(() => { setOrigen(e.target.value); setRuta(''); })}>
            <option value="">Elegí…</option>
            {lista}
          </select>
        </Campo>
        <Campo label="Hasta">
          <select value={destino} onChange={(e) => cambiarViaje(() => { setDestino(e.target.value); setRuta(''); })}>
            <option value="">Elegí…</option>
            {lista}
          </select>
        </Campo>
        <Campo label="Viene vacío desde">
          <select value={vacioDesde} onChange={(e) => cambiarViaje(() => setVacioDesde(e.target.value))}>
            <option value="">La base más cercana{vacioDesde === '' && r?.vacioDesde ? ` (${r.vacioDesde})` : ''}</option>
            <option value="0">No viene vacío (ya está en el origen)</option>
            {lista}
          </select>
        </Campo>
        <Campo label="Vuelve vacío a">
          <select value={vacioHasta} onChange={(e) => cambiarViaje(() => setVacioHasta(e.target.value))}>
            <option value="">La base más cercana{vacioHasta === '' && r?.vacioHasta ? ` (${r.vacioHasta})` : ''}</option>
            <option value="0">No vuelve vacío (tiene carga de vuelta)</option>
            {lista}
          </select>
        </Campo>
        {listos && r && r.rutas.length > 0 && (
          <Campo label="Por dónde va">
            <select value={ruta === '' ? String(r.lineaId ?? '0') : ruta} onChange={(e) => cambiarViaje(() => setRuta(e.target.value))}>
              {r.rutas.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.codigo}
                  {x.km !== null ? ` · ${km(x.km)}` : ''}
                </option>
              ))}
              <option value="0">El camino del mapa</option>
            </select>
          </Campo>
        )}
      </div>

      {!listos ? (
        <p className="text-sm text-tinta-suave">Elegí desde dónde y hasta dónde: el sistema arma el viaje con los vacíos, los días y el gasoil, y sugiere el precio.</p>
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
          {r.avisos.map((a) => (
            <p key={a} className="flex items-start gap-2 text-sm text-alerta">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {a}
            </p>
          ))}

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-borde p-3">
              <p className="text-xs text-tinta-suave">Precio sugerido (margen {formatearNumero(r.margenPct, 0)} % sobre el precio)</p>
              <p className="text-3xl font-semibold tabular-nums text-tinta">{entero(r.precioUsd)}</p>
              <p className="text-sm text-tinta-suave">
                {porKm(r.precioKmCargadoUsd)} por km cargado
                {(r.kmVacio ?? 0) > 0 && ` · ${porKm(r.precioKmUsd)} por km recorrido`}
              </p>
            </div>
            <div className="rounded-lg border border-borde p-3 text-sm">
              <p className="text-xs text-tinta-suave">Costo del viaje</p>
              <p className="text-2xl font-semibold tabular-nums text-tinta">{entero(r.costoUsd)}</p>
              <p className="text-tinta-suave">
                {km(r.kmTotal)} · {dias(r.dias)}
                {(r.kmVacio ?? 0) > 0 && ` · ${km(r.kmVacio)} vacío`}
              </p>
            </div>
            <div className="rounded-lg border border-borde p-3 text-sm text-tinta-suave">
              <p className="text-xs">Con qué se calcula</p>
              <p>
                Gasoil {formatearNumero(r.valores.gasoilClpLitro, 0)} CLP por litro{' '}
                {r.valores.gasoilFuente === 'cargas' ? `(últimas cargas en Chile)` : '(valor fijo)'}
              </p>
              <p>
                Día de camión con chofer: {usd(r.valores.fijoDiaUsd + r.valores.choferDiaUsd)}
              </p>
              {r.tarifaVigenteUsd !== null && (
                <p className="mt-1 text-tinta">
                  Tarifa vigente {r.tarifaDe === 'cliente' ? 'de este cliente' : 'general'}: {usd(r.tarifaVigenteUsd)}
                </p>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead className="text-xs text-tinta-suave">
                <tr>
                  <th className="py-1 pr-3">Tramo</th>
                  <th className="w-24 py-1 pr-3">Km</th>
                  <th className="w-20 py-1 pr-3">Días</th>
                  <th className="py-1 pr-3 text-right">Gasoil</th>
                  <th className="py-1 pr-3 text-right">Camión y chofer</th>
                  <th className="py-1 pr-3 text-right">Canon</th>
                  <th className="py-1 pr-3 text-right">Peajes</th>
                  <th className="py-1 pr-3 text-right">Neumáticos</th>
                  <th className="py-1 pr-3 text-right">Total</th>
                  {puedeGuardar && <th className="py-1" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-borde tabular-nums">
                {r.tramos.map((t) => (
                  <FilaTramo
                    key={`${t.tipo}-${t.desdeId}-${t.hastaId}`}
                    t={t}
                    ajusteKm={ajustes[`km_${t.tipo}`] ?? null}
                    ajusteDias={ajustes[`dias_${t.tipo}`] ?? null}
                    onKm={(v) => ajustar(`km_${t.tipo}`, v)}
                    onDias={(v) => ajustar(`dias_${t.tipo}`, v)}
                    puedeGuardar={puedeGuardar}
                    guardando={guardarTramo.isPending}
                    onGuardar={async () => {
                      setError(null);
                      const res = await guardarTramo.mutateAsync({
                        desdeId: t.desdeId,
                        hastaId: t.hastaId,
                        lineaId: t.tipo === 'cargado' ? t.lineaId : null,
                        km: t.km,
                        dias: t.dias,
                        quitar: false,
                      });
                      if (!res.ok) return setError(res.error.mensaje);
                      ajustar(`km_${t.tipo}`, null);
                      ajustar(`dias_${t.tipo}`, null);
                    }}
                  />
                ))}
                <tr className="font-medium text-tinta">
                  <td className="py-1.5 pr-3">Total</td>
                  <td className="py-1.5 pr-3">{km(r.kmTotal)}</td>
                  <td className="py-1.5 pr-3">{dias(r.dias)}</td>
                  <td className="py-1.5 pr-3 text-right">{entero(r.gasoilUsd)}</td>
                  <td className="py-1.5 pr-3 text-right">{entero(r.camionChoferUsd)}</td>
                  <td className="py-1.5 pr-3 text-right">{r.canonUsd ? entero(r.canonUsd) : '—'}</td>
                  <td className="py-1.5 pr-3 text-right">{entero(r.peajesUsd)}</td>
                  <td className="py-1.5 pr-3 text-right">{entero(r.neumaticosUsd)}</td>
                  <td className="py-1.5 pr-3 text-right">{entero(r.costoUsd)}</td>
                  {puedeGuardar && <td />}
                </tr>
              </tbody>
            </table>
            <p className="mt-1 text-xs text-tinta-suave">
              Los km y los días se pueden cambiar acá (vale para esta cotización). Con <Pin className="inline size-3" /> quedan como estándar del tramo
              para las próximas.
            </p>
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
                  Ganancia: <strong>{entero(precioOfrecido - r.costoUsd)}</strong> ·{' '}
                  <span
                    className={cn(
                      margenResultante !== null && margenResultante < r.valores.margenMinimoPct
                        ? 'text-error'
                        : margenResultante !== null && margenResultante < r.valores.margenObjetivoPct
                          ? 'text-alerta'
                          : 'text-exito',
                    )}
                  >
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
                  disabled={guardar.isPending || precioOfrecido === null || r.kmCargado === null}
                  onClick={async () => {
                    setError(null);
                    const res = await guardar.mutateAsync({
                      empresaId: Number(empresaId) || null,
                      empresaNombre,
                      origenId: Number(origen),
                      destinoId: Number(destino),
                      lineaId: opciones.lineaId,
                      vacioDesde: opciones.vacioDesde,
                      vacioHasta: opciones.vacioHasta,
                      ajustes,
                      precioUsd: precioOfrecido ?? 0,
                      viajes: aNumero(viajesTxt) ?? 1,
                    });
                    if (!res.ok) return setError(res.error.mensaje);
                    router.push(`/cotizaciones/${res.data}`);
                  }}
                >
                  {guardar.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />} Guardar
                </button>
              </div>
            </div>
          )}
          {error && <p className="text-sm text-error">{error}</p>}
        </div>
      ) : null}

      <button type="button" className="inline-flex items-center gap-1 text-xs text-tinta-suave hover:underline" onClick={() => setVerBase((v) => !v)}>
        {verBase ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />} De dónde salen los valores
      </button>
      {verBase && <BaseDelCotizador puedeCambiar={puedeGuardar} />}
    </section>
  );
}

/** Un tramo del viaje: km y días se cambian acá (al salir del campo o con Enter). */
function FilaTramo({
  t,
  ajusteKm,
  ajusteDias,
  onKm,
  onDias,
  puedeGuardar,
  guardando,
  onGuardar,
}: {
  t: TramoViaje;
  ajusteKm: number | null;
  ajusteDias: number | null;
  onKm: (v: number | null) => void;
  onDias: (v: number | null) => void;
  puedeGuardar: boolean;
  guardando: boolean;
  onGuardar: () => void;
}) {
  const distintoDelEstandar = !t.estandar || t.estandar.km !== t.km || t.estandar.dias !== t.dias;
  return (
    <tr className="align-top text-tinta">
      <td className="py-1.5 pr-3">
        <p>{nombreTramo(t)}</p>
        <p className="text-xs text-tinta-suave">
          {t.ruta ? `Ruta ${t.ruta} · ` : ''}
          {formatearNumero(t.litros, 0)} L ({formatearNumero(t.consumoL100, 1)} cada 100 km)
        </p>
        {t.falta && <p className="text-xs text-error">{t.falta}</p>}
      </td>
      <td className="py-1.5 pr-3">
        <NumeroTramo valor={ajusteKm} sugerido={t.km} decimales={0} onCambiar={onKm} etiqueta={`Km de ${nombreTramo(t)}`} />
        <p className="text-xs text-tinta-suave">{t.fuenteKm ? FUENTE_KM[t.fuenteKm] : ''}</p>
      </td>
      <td className="py-1.5 pr-3">
        <NumeroTramo valor={ajusteDias} sugerido={t.dias} decimales={1} onCambiar={onDias} etiqueta={`Días de ${nombreTramo(t)}`} />
        <p className="text-xs text-tinta-suave">{t.fuenteDias ? FUENTE_DIAS[t.fuenteDias] : ''}</p>
      </td>
      <td className="py-1.5 pr-3 text-right">{entero(t.gasoilUsd)}</td>
      <td className="py-1.5 pr-3 text-right">{entero(t.camionChoferUsd)}</td>
      <td className="py-1.5 pr-3 text-right">{t.canonUsd ? entero(t.canonUsd) : '—'}</td>
      <td className="py-1.5 pr-3 text-right">{entero(t.peajesUsd)}</td>
      <td className="py-1.5 pr-3 text-right">{entero(t.neumaticosUsd)}</td>
      <td className="py-1.5 pr-3 text-right font-medium">{entero(t.totalUsd)}</td>
      {puedeGuardar && (
        <td className="py-1.5">
          {t.km !== null && t.dias !== null && distintoDelEstandar && (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-marca hover:bg-marca/10 disabled:opacity-50"
              disabled={guardando}
              title="Guardar estos km y días como estándar del tramo"
              onClick={onGuardar}
            >
              <Pin className="size-3.5" /> Estándar
            </button>
          )}
        </td>
      )}
    </tr>
  );
}

/** Un número que se aplica al salir del campo o con Enter (vacío = el que calcula el sistema). */
function NumeroTramo({
  valor,
  sugerido,
  decimales,
  onCambiar,
  etiqueta,
}: {
  valor: number | null;
  sugerido: number | null;
  decimales: number;
  onCambiar: (v: number | null) => void;
  etiqueta: string;
}) {
  const [texto, setTexto] = useState<string | null>(null);
  const mostrado = texto ?? (valor !== null ? formatearNumero(valor, valor % 1 === 0 ? 0 : decimales) : '');
  const aplicar = () => {
    if (texto === null) return;
    onCambiar(aNumero(texto));
    setTexto(null);
  };
  return (
    <input
      aria-label={etiqueta}
      inputMode="decimal"
      className={cn('h-8 w-full rounded-md border border-borde bg-panel px-2 text-sm tabular-nums', valor !== null && 'border-marca')}
      placeholder={sugerido !== null ? formatearNumero(sugerido, sugerido % 1 === 0 ? 0 : decimales) : ''}
      value={mostrado}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={aplicar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') aplicar();
      }}
    />
  );
}
