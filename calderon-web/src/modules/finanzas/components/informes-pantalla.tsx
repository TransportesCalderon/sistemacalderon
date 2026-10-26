'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { BookOpen, Download, Users } from 'lucide-react';
import { TD, TH } from '@/modules/catalogos/components/comun';
import { Cargando, Encabezado, ErrorLectura, Vacio } from '@/modules/combustible/components/comun/ui';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { hoyEnZona } from '@/shared/lib/fechas';
import { BOTON_SECUNDARIO, CONTROL_FILTRO, TARJETA } from '@/shared/ui/clases';
import { aCsv, dinero, mesCorto, type EstadoResultados, type FlujoCaja, type RenglonDiario, SENTIDO_AUXILIAR, ETIQUETA_ORIGEN, saldoNatural, type SaldoTercero } from '../domain/finanzas.types';
import { useAuxiliares, useEstadoResultados, useFlujoCaja, useLibroDiario, useMayor, usePlanCuentas } from '../queries/hooks';
import { fecha } from './comun';

type Vista = 'resultados' | 'flujo' | 'diario' | 'mayor' | 'saldos';

function bajar(nombre: string, contenido: string) {
  const url = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

/** Finanzas › Informes: estado de resultados y flujo de caja mes a mes, y el libro diario para el contador. */
export function InformesPantalla() {
  const { zonaHoraria } = useSesion();
  const hoy = hoyEnZona(zonaHoraria) as string;
  const pedida = Number(useSearchParams().get('mayor')) || null;
  const [vista, setVista] = useState<Vista>(pedida ? 'mayor' : 'resultados');
  const [desde, setDesde] = useState(`${hoy.slice(0, 4)}-01-01`);
  const [hasta, setHasta] = useState(hoy);
  const [filtroMayor, setFiltroMayor] = useState<FiltroMayor>({ cuenta: pedida, terceroTipo: null, terceroId: null, tercero: null });
  return (
    <div className="space-y-5">
      <Encabezado titulo="Informes" subtitulo="Finanzas" />
      <nav aria-label="Informes" className="-mt-1 flex flex-wrap gap-1 border-b border-borde">
        {(
          [
            ['resultados', 'Estado de resultados'],
            ['flujo', 'Flujo de caja'],
            ['diario', 'Libro diario'],
            ['mayor', 'Libro mayor'],
            ['saldos', 'Saldos por cliente, proveedor y chofer'],
          ] as const
        ).map(([v, t]) => (
          <button
            key={v}
            type="button"
            onClick={() => setVista(v)}
            aria-current={vista === v ? 'page' : undefined}
            className={cn('-mb-px border-b-2 px-3 py-2 text-sm', vista === v ? 'border-marca font-medium text-marca' : 'border-transparent text-tinta-suave hover:text-tinta')}
          >
            {t}
          </button>
        ))}
      </nav>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex items-center gap-1 text-sm text-tinta-suave">
          Desde <input type="date" className={CONTROL_FILTRO} value={desde} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label className="flex items-center gap-1 text-sm text-tinta-suave">
          Hasta <input type="date" className={CONTROL_FILTRO} value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </label>
        <button type="button" className={cn(CONTROL_FILTRO, 'hover:bg-hover')} onClick={() => (setDesde(`${hoy.slice(0, 4)}-01-01`), setHasta(hoy))}>
          Este año
        </button>
        <button
          type="button"
          className={cn(CONTROL_FILTRO, 'hover:bg-hover')}
          onClick={() => {
            const a = Number(hoy.slice(0, 4)) - 1;
            setDesde(`${a}-01-01`);
            setHasta(`${a}-12-31`);
          }}
        >
          Año pasado
        </button>
      </div>
      {vista === 'resultados' ? (
        <Resultados desde={desde} hasta={hasta} />
      ) : vista === 'flujo' ? (
        <Flujo desde={desde} hasta={hasta} />
      ) : vista === 'diario' ? (
        <Diario desde={desde} hasta={hasta} />
      ) : vista === 'mayor' ? (
        <LibroMayor desde={desde} hasta={hasta} filtro={filtroMayor} onFiltro={setFiltroMayor} />
      ) : (
        <Saldos hasta={hasta} onVer={(f) => (setFiltroMayor(f), setVista('mayor'))} />
      )}
    </div>
  );
}

function Resultados({ desde, hasta }: { desde: string; hasta: string }) {
  const { data, isLoading, isError, error, refetch } = useEstadoResultados(desde, hasta);
  if (isLoading) return <Cargando texto="Armando el estado de resultados…" />;
  if (isError || !data) return <ErrorLectura texto="No se pudo armar el informe." onReintentar={() => void refetch()} error={error} />;
  return <TablaResultados er={data} desde={desde} hasta={hasta} />;
}

function TablaResultados({ er, desde, hasta }: { er: EstadoResultados; desde: string; hasta: string }) {
  const suma = (xs: number[]) => xs.reduce((s, v) => s + v, 0);
  const bloque = (tipo: 'ingreso' | 'costo' | 'gasto') => er.filas.filter((f) => f.tipo === tipo);
  const filaTotal = (titulo: string, valores: number[], fuerte = false, signo = false) => (
    <tr className={cn(fuerte ? 'bg-fondo font-semibold' : 'font-medium')}>
      <td className={cn(TD, 'sticky left-0 bg-inherit')}>{titulo}</td>
      {valores.map((v, i) => (
        <td key={i} className={cn(TD, 'text-right tabular-nums', signo && v < 0 && 'text-error')}>
          {dinero(v)}
        </td>
      ))}
      <td className={cn(TD, 'text-right tabular-nums', signo && suma(valores) < 0 && 'text-error')}>{dinero(suma(valores))}</td>
    </tr>
  );
  const renglones = (tipo: 'ingreso' | 'costo' | 'gasto') =>
    bloque(tipo).map((f) => (
      <tr key={f.cuentaId} className="text-tinta-suave">
        <td className={cn(TD, 'sticky left-0 bg-panel pl-6')}>
          {f.codigo} · {f.nombre}
        </td>
        {f.valores.map((v, i) => (
          <td key={i} className={cn(TD, 'text-right tabular-nums')}>
            {v ? dinero(v) : '—'}
          </td>
        ))}
        <td className={cn(TD, 'text-right tabular-nums')}>{dinero(f.total)}</td>
      </tr>
    ));
  const csv = () => {
    const cab = ['Concepto', ...er.meses.map(mesCorto), 'Total'];
    const f = (t: string, v: number[]) => [t, ...v, suma(v)];
    bajar(
      `estado_resultados_${desde}_${hasta}.csv`,
      aCsv([
        cab,
        f('INGRESOS', er.ingresos),
        ...bloque('ingreso').map((x) => [`${x.codigo} ${x.nombre}`, ...x.valores, x.total]),
        f('COSTOS DE OPERACIÓN', er.costos),
        ...bloque('costo').map((x) => [`${x.codigo} ${x.nombre}`, ...x.valores, x.total]),
        f('MARGEN', er.margen),
        f('GASTOS DE ADMINISTRACIÓN Y FINANCIEROS', er.gastos),
        ...bloque('gasto').map((x) => [`${x.codigo} ${x.nombre}`, ...x.valores, x.total]),
        f('RESULTADO', er.resultado),
      ]),
    );
  };
  if (er.filas.length === 0) return <Vacio icono={<Download className="size-6" />} texto="No hay movimientos en ese período." />;
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button type="button" className={BOTON_SECUNDARIO} onClick={csv}>
          <Download className="size-4" /> Bajar en Excel (CSV)
        </button>
      </div>
      <div className={cn(TARJETA, 'overflow-x-auto')}>
        <table className="w-full min-w-max text-sm whitespace-nowrap">
          <thead className="border-b border-borde bg-fondo">
            <tr>
              <th className={cn(TH, 'sticky left-0 bg-fondo')}>Concepto</th>
              {er.meses.map((m) => (
                <th key={m} className={cn(TH, 'text-right')}>
                  {mesCorto(m)}
                </th>
              ))}
              <th className={cn(TH, 'text-right')}>Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {filaTotal('Ingresos', er.ingresos)}
            {renglones('ingreso')}
            {filaTotal('Costos de operación', er.costos)}
            {renglones('costo')}
            {filaTotal('Margen (ingresos − costos)', er.margen, true, true)}
            {filaTotal('Gastos de administración y financieros', er.gastos)}
            {renglones('gasto')}
            {filaTotal('Resultado del período', er.resultado, true, true)}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-tinta-suave">
        Sale de los asientos que arma el sistema (facturas emitidas, gastos y movimientos). Es un resultado de gestión antes de impuestos; el contador lo
        ajusta con depreciaciones, provisiones e impuesto a la renta.
      </p>
    </div>
  );
}

function Flujo({ desde, hasta }: { desde: string; hasta: string }) {
  const { data, isLoading, isError, error, refetch } = useFlujoCaja(desde, hasta);
  if (isLoading) return <Cargando texto="Armando el flujo de caja…" />;
  if (isError || !data) return <ErrorLectura texto="No se pudo armar el informe." onReintentar={() => void refetch()} error={error} />;
  return <TablaFlujo fc={data} desde={desde} hasta={hasta} />;
}

function TablaFlujo({ fc, desde, hasta }: { fc: FlujoCaja; desde: string; hasta: string }) {
  const entradas = fc.lineas.filter((l) => l.entrada);
  const salidas = fc.lineas.filter((l) => !l.entrada);
  const conApertura = fc.apertura.some((v) => v !== 0);
  const fila = (t: string, v: number[], clase = '', negar = false) => (
    <tr className={clase}>
      <td className={cn(TD, 'sticky left-0 bg-inherit')}>{t}</td>
      {v.map((x, i) => (
        <td key={i} className={cn(TD, 'text-right tabular-nums')}>
          {x ? dinero(negar ? -x : x) : '—'}
        </td>
      ))}
    </tr>
  );
  const csv = () =>
    bajar(
      `flujo_caja_${desde}_${hasta}.csv`,
      aCsv([
        ['Concepto', ...fc.meses.map(mesCorto)],
        ['Saldo inicial', ...fc.saldoInicial],
        ...(conApertura ? [['Saldos iniciales cargados', ...fc.apertura]] : []),
        ['ENTRADAS', ...fc.entradas],
        ...entradas.map((l) => [l.concepto, ...l.valores]),
        ['SALIDAS', ...fc.salidas],
        ...salidas.map((l) => [l.concepto, ...l.valores.map((v) => -v)]),
        ['Saldo final', ...fc.saldoFinal],
      ]),
    );
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button type="button" className={BOTON_SECUNDARIO} onClick={csv}>
          <Download className="size-4" /> Bajar en Excel (CSV)
        </button>
      </div>
      <div className={cn(TARJETA, 'overflow-x-auto')}>
        <table className="w-full min-w-max text-sm whitespace-nowrap">
          <thead className="border-b border-borde bg-fondo">
            <tr>
              <th className={cn(TH, 'sticky left-0 bg-fondo')}>Concepto</th>
              {fc.meses.map((m) => (
                <th key={m} className={cn(TH, 'text-right')}>
                  {mesCorto(m)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {fila('Saldo al empezar el mes', fc.saldoInicial, 'bg-fondo font-medium')}
            {conApertura && fila('Saldos iniciales cargados', fc.apertura, 'text-tinta-suave')}
            {fila('Entradas', fc.entradas, 'font-medium')}
            {entradas.map((l) => (
              <tr key={`e-${l.concepto}`} className="text-tinta-suave">
                <td className={cn(TD, 'sticky left-0 bg-panel pl-6')}>{l.concepto}</td>
                {l.valores.map((v, i) => (
                  <td key={i} className={cn(TD, 'text-right tabular-nums')}>
                    {v ? dinero(v) : '—'}
                  </td>
                ))}
              </tr>
            ))}
            {fila('Salidas', fc.salidas, 'font-medium')}
            {salidas.map((l) => (
              <tr key={`s-${l.concepto}`} className="text-tinta-suave">
                <td className={cn(TD, 'sticky left-0 bg-panel pl-6')}>{l.concepto}</td>
                {l.valores.map((v, i) => (
                  <td key={i} className={cn(TD, 'text-right tabular-nums')}>
                    {v ? dinero(-v) : '—'}
                  </td>
                ))}
              </tr>
            ))}
            {fila('Saldo al terminar el mes', fc.saldoFinal, 'bg-fondo font-semibold')}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-tinta-suave">
        Es la plata que entró y salió de los bancos y cajas, en pesos (lo que está en dólares se pasa al tipo de cambio de cada día). Las transferencias
        entre cuentas propias no cuentan como entrada ni salida.
      </p>
    </div>
  );
}

function Diario({ desde, hasta }: { desde: string; hasta: string }) {
  const { data, isLoading, isError, error, refetch } = useLibroDiario(desde, hasta, true);
  if (isLoading) return <Cargando texto="Armando el libro diario…" />;
  if (isError || !data) return <ErrorLectura texto="No se pudo armar el libro diario." onReintentar={() => void refetch()} error={error} />;
  return <TablaDiario filas={data} desde={desde} hasta={hasta} />;
}

function TablaDiario({ filas, desde, hasta }: { filas: RenglonDiario[]; desde: string; hasta: string }) {
  const debe = filas.reduce((s, f) => s + f.debe, 0);
  const haber = filas.reduce((s, f) => s + f.haber, 0);
  const csv = () =>
    bajar(
      `libro_diario_${desde}_${hasta}.csv`,
      aCsv([['Asiento', 'Fecha', 'Glosa', 'Cuenta', 'Nombre de la cuenta', 'Debe', 'Haber', 'Detalle'], ...filas.map((f) => [f.asiento, f.fecha, f.glosa, f.codigo, f.cuenta, f.debe, f.haber, f.detalle])]),
    );
  if (filas.length === 0) return <Vacio icono={<Download className="size-6" />} texto="No hay asientos en ese período." />;
  let anterior = -1;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-tinta-suave">
          {new Set(filas.map((f) => f.asiento)).size} asientos · debe {dinero(debe)} · haber {dinero(haber)}
        </p>
        <button type="button" className={BOTON_SECUNDARIO} onClick={csv}>
          <Download className="size-4" /> Bajar para el contador (CSV)
        </button>
      </div>
      <div className={cn(TARJETA, 'max-h-[70vh] overflow-auto')}>
        <table className="w-full min-w-[820px] text-sm">
          <thead className="sticky top-0 border-b border-borde bg-fondo">
            <tr>
              <th className={TH}>Fecha</th>
              <th className={TH}>Cuenta</th>
              <th className={cn(TH, 'text-right')}>Debe</th>
              <th className={cn(TH, 'text-right')}>Haber</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => {
              const nuevo = f.asiento !== anterior;
              anterior = f.asiento;
              return (
                <tr key={i} className={cn(nuevo && 'border-t border-borde')}>
                  <td className={cn(TD, 'py-1 align-top tabular-nums')}>
                    {nuevo && (
                      <>
                        {fecha(f.fecha)}
                        <span className="block max-w-72 text-xs text-tinta-suave">{f.glosa}</span>
                      </>
                    )}
                  </td>
                  <td className={cn(TD, 'py-1', f.haber > 0 && 'pl-8')}>
                    {f.codigo} · {f.cuenta}
                  </td>
                  <td className={cn(TD, 'py-1 text-right tabular-nums')}>{f.debe ? dinero(f.debe) : ''}</td>
                  <td className={cn(TD, 'py-1 text-right tabular-nums')}>{f.haber ? dinero(f.haber) : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface FiltroMayor {
  cuenta: number | null;
  terceroTipo: string | null;
  terceroId: number | null;
  tercero: string | null;
}

/** Libro mayor: todos los movimientos de una cuenta (y opcionalmente de un cliente, proveedor o chofer), con saldo. */
function LibroMayor({ desde, hasta, filtro, onFiltro }: { desde: string; hasta: string; filtro: FiltroMayor; onFiltro: (f: FiltroMayor) => void }) {
  const { data: plan } = usePlanCuentas();
  const { data, isLoading, isError, error, refetch } = useMayor(filtro.cuenta, desde, hasta, filtro.terceroTipo, filtro.terceroId);
  const imputables = (plan ?? []).filter((c) => c.imputable);
  // Las cuentas de deuda, patrimonio e ingresos se leen al revés (haber − debe): así el saldo normal es positivo
  const signo = data && ['pasivo', 'patrimonio', 'ingreso'].includes(data.cuenta.tipo) ? -1 : 1;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          className={CONTROL_FILTRO}
          aria-label="Cuenta"
          value={filtro.cuenta ?? ''}
          onChange={(e) => onFiltro({ cuenta: e.target.value ? Number(e.target.value) : null, terceroTipo: null, terceroId: null, tercero: null })}
        >
          <option value="">Elegí la cuenta…</option>
          {imputables.map((c) => (
            <option key={c.id} value={c.id}>
              {c.codigo} · {c.nombre}
            </option>
          ))}
        </select>
        {filtro.tercero && (
          <button type="button" className={cn(CONTROL_FILTRO, 'hover:bg-hover')} onClick={() => onFiltro({ ...filtro, terceroTipo: null, terceroId: null, tercero: null })}>
            Solo {filtro.tercero} ✕
          </button>
        )}
        {data && data.renglones.length > 0 && (
          <button
            type="button"
            className={BOTON_SECUNDARIO}
            onClick={() =>
              bajar(
                `mayor-${data.cuenta.codigo}-${desde}-${hasta}.csv`,
                aCsv([
                  ['Fecha', 'Asiento', 'Glosa', 'Detalle', 'Tercero', 'Camión', 'Debe', 'Haber', 'Saldo'],
                  ...data.renglones.map((r) => [r.fecha, r.asiento, r.glosa, r.detalle, r.tercero, r.camion, r.debe, r.haber, signo * r.saldo]),
                ]),
              )
            }
          >
            <Download className="size-4" /> Bajar para Excel
          </button>
        )}
      </div>
      {!filtro.cuenta ? (
        <Vacio icono={<BookOpen className="size-6" />} texto="Elegí una cuenta para ver su libro mayor." />
      ) : isLoading ? (
        <Cargando texto="Armando el mayor…" />
      ) : isError || !data ? (
        <ErrorLectura texto="No se pudo leer el libro mayor." onReintentar={() => void refetch()} error={error} />
      ) : (
        <div className={cn(TARJETA, 'overflow-x-auto p-0')}>
          <table className="w-full min-w-[900px] text-sm tabular-nums">
            <thead className="border-b border-borde bg-fondo">
              <tr>
                <th className={TH}>Fecha</th>
                <th className={TH}>Qué fue</th>
                <th className={TH}>Cliente / proveedor / chofer</th>
                <th className={cn(TH, 'text-right')}>Debe</th>
                <th className={cn(TH, 'text-right')}>Haber</th>
                <th className={cn(TH, 'text-right')}>Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              <tr className="bg-fondo/50">
                <td className={TD}>{fecha(desde)}</td>
                <td className={TD} colSpan={4}>
                  Saldo al empezar
                </td>
                <td className={cn(TD, 'text-right font-medium whitespace-nowrap')}>{dinero(signo * data.saldoInicial)}</td>
              </tr>
              {data.renglones.map((r, i) => (
                <tr key={`${r.asiento}-${i}`}>
                  <td className={TD}>{fecha(r.fecha)}</td>
                  <td className={TD}>
                    {r.ruta ? (
                      <Link href={r.ruta} className="text-marca hover:underline">
                        {r.glosa}
                      </Link>
                    ) : (
                      r.glosa
                    )}
                    <span className="block text-xs text-tinta-suave">
                      {[ETIQUETA_ORIGEN[r.origen] ?? r.origen, r.detalle, r.camion].filter(Boolean).join(' · ')}
                    </span>
                  </td>
                  <td className={cn(TD, 'text-xs')}>{r.tercero ?? ''}</td>
                  <td className={cn(TD, 'text-right whitespace-nowrap')}>{r.debe ? dinero(r.debe) : ''}</td>
                  <td className={cn(TD, 'text-right whitespace-nowrap')}>{r.haber ? dinero(r.haber) : ''}</td>
                  <td className={cn(TD, 'text-right font-medium whitespace-nowrap')}>{dinero(signo * r.saldo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.renglones.length === 0 && <p className="p-3 text-sm text-tinta-suave">Sin movimientos en estas fechas.</p>}
        </div>
      )}
    </div>
  );
}

/** Saldos abiertos de cada cliente, proveedor y chofer (auxiliares), agrupados por cuenta. */
function Saldos({ hasta, onVer }: { hasta: string; onVer: (f: FiltroMayor) => void }) {
  const { data, isLoading, isError, error, refetch } = useAuxiliares(hasta);
  if (isLoading) return <Cargando texto="Sumando saldos…" />;
  if (isError || !data) return <ErrorLectura texto="No se pudieron leer los saldos." onReintentar={() => void refetch()} error={error} />;
  if (data.length === 0) return <Vacio icono={<Users className="size-6" />} texto={`Al ${fecha(hasta)} no hay saldos abiertos.`} />;
  const grupos = new Map<number, SaldoTercero[]>();
  for (const a of data) grupos.set(a.cuentaId, [...(grupos.get(a.cuentaId) ?? []), a]);
  return (
    <div className="space-y-4">
      <p className="text-sm text-tinta-suave">Saldos al {fecha(hasta)}. Tocá un nombre para ver todos sus movimientos.</p>
      {[...grupos.values()].map((filas) => {
        const s = SENTIDO_AUXILIAR[filas[0]!.uso ?? ''];
        const total = filas.reduce((t, f) => t + saldoNatural(f), 0);
        return (
          <div key={filas[0]!.cuentaId} className={cn(TARJETA, 'p-0')}>
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-borde px-3 py-2">
              <h3 className="font-medium text-tinta">{s?.titulo ?? filas[0]!.cuenta}</h3>
              <span className="text-sm font-medium tabular-nums">{dinero(total)}</span>
            </div>
            <table className="w-full text-sm tabular-nums">
              <tbody className="divide-y divide-borde">
                {filas.map((f) => (
                  <tr key={`${f.terceroTipo}-${f.terceroId}`}>
                    <td className={TD}>
                      <button
                        type="button"
                        className="text-left text-marca hover:underline"
                        onClick={() => onVer({ cuenta: f.cuentaId, terceroTipo: f.terceroTipo, terceroId: f.terceroId, tercero: f.tercero })}
                      >
                        {f.tercero}
                      </button>
                    </td>
                    <td className={cn(TD, 'text-xs text-tinta-suave')}>{f.desde ? `desde ${fecha(f.desde)}` : ''}</td>
                    <td className={cn(TD, 'text-right')}>
                      {dinero(Math.abs(saldoNatural(f)))}
                      <span className="block text-xs text-tinta-suave">{saldoNatural(f) >= 0 ? (s?.positivo ?? '') : 'al revés de lo normal'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
