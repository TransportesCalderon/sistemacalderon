'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, EyeOff, FileSpreadsheet, LoaderCircle, Undo2, Upload } from 'lucide-react';
import { TD, TH, useEnvio } from '@/modules/catalogos/components/comun';
import { Cargando, Chip, Encabezado, ErrorBase, ErrorLectura, Seccion, Vacio } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import type { ErrorAccion } from '@/server/actions/result';
import { cn } from '@/shared/lib/cn';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, CONTROL_FILTRO, TARJETA } from '@/shared/ui/clases';
import {
  buscarTitulos,
  ETIQUETA_COLUMNA,
  filasParaImportar,
  leerCsv,
  mapeoCompleto,
  textoCelda,
  type Celda,
  type Columna,
  type Mapeo,
} from '../domain/cartola';
import { cuentasParaMovimiento, dinero, type CuentaDinero, type LineaCartola, type ResultadoImportacion } from '../domain/finanzas.types';
import {
  useCartola,
  useConciliar,
  useCrearDesdeLinea,
  useCuentasDinero,
  useDesconciliar,
  useIgnorarLinea,
  useImportarCartola,
  useMovimientos,
  usePlanCuentas,
} from '../queries/hooks';
import { fecha, OpcionesCuentas } from './comun';

/** Finanzas › Bancos y cajas › cuenta: importar la cartola y conciliar cada línea. */
export function CartolaPantalla({ cuentaId }: { cuentaId: number }) {
  const { data: cuentas, isLoading } = useCuentasDinero();
  const c = cuentas?.find((x) => x.id === cuentaId);
  const puede = useCan('finanzas.bancos:editar');
  const [todas, setTodas] = useState(false);
  if (isLoading) return <Cargando texto="Abriendo la cuenta…" />;
  if (!c) return <ErrorLectura texto="La cuenta no existe." onReintentar={() => undefined} />;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Encabezado titulo={c.nombre} subtitulo="Bancos y cajas" />
        <Link href="/finanzas/bancos" className={BOTON_SECUNDARIO}>
          <ArrowLeft className="size-4" /> Volver
        </Link>
      </div>
      <div className="flex flex-wrap gap-6 text-sm">
        <span>
          Saldo según el sistema: <span className="font-semibold tabular-nums">{dinero(c.saldo, c.moneda)}</span>
        </span>
        {c.cartolaSaldo !== null && (
          <span>
            Según la cartola ({fecha(c.cartolaFecha)}): <span className="font-semibold tabular-nums">{dinero(c.cartolaSaldo, c.moneda)}</span>
          </span>
        )}
      </div>
      {puede && c.tipo === 'banco' && <Importar cuenta={c} />}
      <Seccion
        titulo={todas ? 'Todas las líneas de la cartola' : 'Líneas por conciliar'}
        acciones={
          <label className="flex items-center gap-2 text-sm text-tinta-suave">
            <input type="checkbox" className="size-4 accent-marca" checked={todas} onChange={(e) => setTodas(e.target.checked)} /> Ver también las conciliadas
          </label>
        }
      >
        <Lineas cuenta={c} todas={todas} />
      </Seccion>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Importación
// ---------------------------------------------------------------------------
function Importar({ cuenta }: { cuenta: CuentaDinero }) {
  const importar = useImportarCartola();
  const envio = useEnvio();
  const [filas, setFilas] = useState<Celda[][] | null>(null);
  const [titulos, setTitulos] = useState(0);
  const [mapeo, setMapeo] = useState<Mapeo>({});
  const [aviso, setAviso] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);
  const [leyendo, setLeyendo] = useState(false);

  const leer = async (archivo: File) => {
    setAviso(null);
    setResultado(null);
    setFilas(null);
    setLeyendo(true);
    try {
      let datos: Celda[][];
      const nombre = archivo.name.toLowerCase();
      if (nombre.endsWith('.csv') || nombre.endsWith('.txt')) {
        datos = leerCsv(await archivo.text());
      } else if (nombre.endsWith('.xlsx')) {
        const { readSheet } = await import('read-excel-file/universal');
        datos = (await readSheet(await archivo.arrayBuffer())) as unknown as Celda[][];
      } else {
        setAviso('Ese formato no se puede leer. Abrí el archivo en Excel y guardalo como «Libro de Excel (.xlsx)» o como CSV.');
        return;
      }
      const t = buscarTitulos(datos);
      setFilas(datos);
      setTitulos(t ? t.fila : 0);
      setMapeo(t ? t.mapeo : {});
      if (!t) setAviso('No encontré la fila de títulos: elegí a mano qué columna es cada dato.');
    } catch {
      setAviso('No se pudo leer el archivo. Si es un .xls viejo, guardalo como .xlsx o CSV desde Excel.');
    } finally {
      setLeyendo(false);
    }
  };

  const columnas = filas ? Math.max(...filas.slice(titulos, titulos + 30).map((f) => f.length), 0) : 0;
  const nombreCol = (j: number) => textoCelda(filas?.[titulos]?.[j]) || `Columna ${j + 1}`;
  const aImportar = filas && mapeoCompleto(mapeo) ? filasParaImportar(filas, titulos + 1, mapeo) : [];

  return (
    <Seccion titulo="Importar la cartola">
      <p className="text-sm text-tinta-suave">
        Bajá la cartola del banco en Excel (.xlsx) o CSV y subila acá. Las líneas que ya estaban importadas no se repiten.
      </p>
      <label className={cn(BOTON_SECUNDARIO, 'cursor-pointer')}>
        {leyendo ? <LoaderCircle className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />} Elegir el archivo
        <input
          type="file"
          accept=".xlsx,.csv,.txt"
          className="sr-only"
          onChange={(e) => {
            const a = e.target.files?.[0];
            if (a) void leer(a);
            e.target.value = '';
          }}
        />
      </label>
      {aviso && <p className="text-sm text-alerta">{aviso}</p>}
      {filas && (
        <div className={cn(TARJETA, 'space-y-3 p-3')}>
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1 text-sm">
              <span className="block text-tinta-suave">Fila de títulos</span>
              <select className={CONTROL_FILTRO} value={titulos} onChange={(e) => setTitulos(Number(e.target.value))}>
                {filas.slice(0, 20).map((f, i) => (
                  <option key={i} value={i}>
                    {i + 1}: {f.map(textoCelda).filter(Boolean).join(' · ').slice(0, 60) || '(vacía)'}
                  </option>
                ))}
              </select>
            </label>
            {(Object.keys(ETIQUETA_COLUMNA) as Columna[]).map((col) => (
              <label key={col} className="space-y-1 text-sm">
                <span className="block text-tinta-suave">{ETIQUETA_COLUMNA[col]}</span>
                <select
                  className={CONTROL_FILTRO}
                  value={mapeo[col] ?? ''}
                  onChange={(e) => setMapeo({ ...mapeo, [col]: e.target.value === '' ? undefined : Number(e.target.value) })}
                >
                  <option value="">—</option>
                  {Array.from({ length: columnas }, (_, j) => (
                    <option key={j} value={j}>
                      {nombreCol(j)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {!mapeoCompleto(mapeo) ? (
            <p className="text-sm text-alerta">Falta elegir la fecha y el monto (o cargos y abonos).</p>
          ) : (
            <>
              <p className="text-sm text-tinta-suave">Así se van a leer las primeras líneas ({aImportar.length} en total):</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-xs">
                  <thead className="text-tinta-suave">
                    <tr>
                      <th className="px-2 py-1 text-left">Fecha</th>
                      <th className="px-2 py-1 text-left">Descripción</th>
                      <th className="px-2 py-1 text-right">Cargo</th>
                      <th className="px-2 py-1 text-right">Abono</th>
                      <th className="px-2 py-1 text-right">Monto</th>
                      <th className="px-2 py-1 text-right">Saldo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borde">
                    {aImportar.slice(0, 6).map((f, i) => (
                      <tr key={i}>
                        <td className="px-2 py-1">{f.fecha}</td>
                        <td className="px-2 py-1">{f.descripcion}</td>
                        <td className="px-2 py-1 text-right">{f.cargo}</td>
                        <td className="px-2 py-1 text-right">{f.abono}</td>
                        <td className="px-2 py-1 text-right">{f.monto}</td>
                        <td className="px-2 py-1 text-right">{f.saldo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                className={BOTON_PRIMARIO}
                disabled={importar.isPending || aImportar.length === 0}
                onClick={() =>
                  void envio.enviar(
                    importar.mutateAsync({ cuentaId: cuenta.id, filas: aImportar }).then((r) => {
                      if (r.ok) {
                        setResultado(r.data);
                        setFilas(null);
                      }
                      return r;
                    }),
                    () => undefined,
                  )
                }
              >
                {importar.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />} Importar {aImportar.length} líneas
              </button>
            </>
          )}
          <ErrorBase error={envio.error} />
        </div>
      )}
      {resultado && (
        <div className="rounded-lg border border-exito/30 bg-exito/5 p-3 text-sm">
          <p className="text-exito">
            Se importaron {resultado.nuevas} líneas nuevas{resultado.repetidas > 0 && ` (${resultado.repetidas} ya estaban)`}.
          </p>
          {resultado.errores.length > 0 && (
            <ul className="mt-1 list-inside list-disc text-alerta">
              {resultado.errores.slice(0, 10).map((e) => (
                <li key={e.fila}>
                  Fila {e.fila}: {e.motivo}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Seccion>
  );
}

// ---------------------------------------------------------------------------
// Conciliación
// ---------------------------------------------------------------------------
function Lineas({ cuenta, todas }: { cuenta: CuentaDinero; todas: boolean }) {
  const { data, isLoading, isError, error, refetch } = useCartola(cuenta.id, !todas);
  const [err, setErr] = useState<ErrorAccion | null>(null);
  if (isLoading) return <Cargando texto="Leyendo la cartola…" />;
  if (isError || !data) return <ErrorLectura texto="No se pudo leer la cartola." onReintentar={() => void refetch()} error={error} />;
  if (data.length === 0)
    return <Vacio icono={<Check className="size-6" />} texto={todas ? 'Todavía no hay cartola importada.' : 'No queda nada por conciliar.'} />;
  return (
    <div className="space-y-3">
      <ErrorBase error={err} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="border-y border-borde bg-fondo">
            <tr>
              <th className={TH}>Fecha</th>
              <th className={TH}>Descripción</th>
              <th className={cn(TH, 'text-right')}>Monto</th>
              <th className={TH}>Qué es</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {data.map((l) => (
              <FilaLinea key={l.id} l={l} cuenta={cuenta} onError={setErr} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilaLinea({ l, cuenta, onError }: { l: LineaCartola; cuenta: CuentaDinero; onError: (e: ErrorAccion | null) => void }) {
  const puede = useCan('finanzas.bancos:editar');
  const conciliar = useConciliar();
  const crear = useCrearDesdeLinea();
  const ignorar = useIgnorarLinea();
  const soltar = useDesconciliar();
  const [otro, setOtro] = useState(false);
  const ocupado = conciliar.isPending || crear.isPending || ignorar.isPending || soltar.isPending;
  const correr = async (p: Promise<{ ok: boolean; error?: ErrorAccion }>) => {
    onError(null);
    const r = await p;
    if (!r.ok && r.error) onError(r.error);
  };
  const base = { facturaId: null, gastoId: null, cuentaId: null, destinoId: null, montoDestino: null, descripcion: null };

  return (
    <tr className={cn(l.ignorada && 'text-tinta-suave')}>
      <td className={cn(TD, 'tabular-nums')}>{fecha(l.fecha)}</td>
      <td className={TD}>
        {l.descripcion}
        {l.documento && <span className="block text-xs text-tinta-suave">Doc. {l.documento}</span>}
      </td>
      <td className={cn(TD, 'text-right font-medium tabular-nums', l.monto > 0 ? 'text-exito' : 'text-tinta')}>{dinero(l.monto, cuenta.moneda)}</td>
      <td className={cn(TD, 'min-w-[340px]')}>
        {l.movimientoId ? (
          <div className="flex flex-wrap items-center gap-2">
            <Chip tono="exito">Conciliada con {l.movimiento}</Chip>
            {puede && (
              <button type="button" className="text-xs text-marca hover:underline" disabled={ocupado} onClick={() => void correr(soltar.mutateAsync({ lineaId: l.id }))}>
                Soltar
              </button>
            )}
          </div>
        ) : l.ignorada ? (
          <div className="flex flex-wrap items-center gap-2">
            <Chip tono="neutro">Ignorada</Chip>
            {puede && (
              <button type="button" className="inline-flex items-center gap-1 text-xs text-marca hover:underline" onClick={() => void correr(ignorar.mutateAsync({ lineaId: l.id, ignorar: false }))}>
                <Undo2 className="size-3" /> Volver a pendiente
              </button>
            )}
          </div>
        ) : !puede ? (
          <span className="text-xs text-tinta-suave">Sin conciliar</span>
        ) : (
          <div className="space-y-2">
            {l.sugerencias.map((s) => (
              <button
                key={`${s.clase}-${s.id}`}
                type="button"
                disabled={ocupado}
                className="flex w-full items-center gap-2 rounded-md border border-marca/30 bg-marca-suave px-2 py-1.5 text-left text-xs text-marca hover:bg-marca-suave/70"
                onClick={() =>
                  void correr(
                    s.clase === 'movimiento'
                      ? conciliar.mutateAsync({ lineaId: l.id, movimientoId: s.id })
                      : crear.mutateAsync({ ...base, lineaId: l.id, tipo: s.clase === 'gasto' ? 'pago' : 'cobro', gastoId: s.clase === 'gasto' ? s.id : null, facturaId: s.clase === 'factura' ? s.id : null }),
                  )
                }
              >
                <Check className="size-3.5 shrink-0" />
                <span>
                  {s.clase === 'movimiento' ? 'Es ' : s.clase === 'gasto' ? 'Pago de ' : 'Cobro de '}
                  {s.texto}
                </span>
              </button>
            ))}
            {otro ? (
              <OtroMovimiento linea={l} cuenta={cuenta} onListo={() => setOtro(false)} onError={onError} />
            ) : (
              <div className="flex flex-wrap gap-2">
                <button type="button" className="text-xs font-medium text-marca hover:underline" onClick={() => setOtro(true)}>
                  {l.sugerencias.length ? 'Es otra cosa…' : 'Decir qué es…'}
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs text-tinta-suave hover:underline"
                  disabled={ocupado}
                  onClick={() => void correr(ignorar.mutateAsync({ lineaId: l.id, ignorar: true }))}
                >
                  <EyeOff className="size-3" /> Ignorar
                </button>
              </div>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

/** La línea es otra cosa: un movimiento ya cargado, otro ingreso/egreso o una transferencia. */
function OtroMovimiento({ linea, cuenta, onListo, onError }: { linea: LineaCartola; cuenta: CuentaDinero; onListo: () => void; onError: (e: ErrorAccion | null) => void }) {
  const { data: plan } = usePlanCuentas();
  const { data: cuentas } = useCuentasDinero();
  const { data: movs } = useMovimientos(cuenta.id, null, null);
  const crear = useCrearDesdeLinea();
  const conciliar = useConciliar();
  const entra = linea.monto > 0;
  const [tipo, setTipo] = useState<'mov' | 'ingreso' | 'egreso' | 'transferencia'>(entra ? 'ingreso' : 'egreso');
  const [cuentaId, setCuentaId] = useState<number | null>(null);
  const [destino, setDestino] = useState<number | null>(null);
  const [movId, setMovId] = useState<number | null>(null);
  const [desc, setDesc] = useState(linea.descripcion);
  const sueltos = (movs ?? []).filter((m) => m.estado === 'vigente' && !m.conciliado);
  return (
    <div className="space-y-2 rounded-md border border-borde p-2">
      <select className={cn(CONTROL_FILTRO, 'w-full')} value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} aria-label="Qué es">
        {entra ? <option value="ingreso">Otro ingreso</option> : <option value="egreso">Otro egreso (comisión, impuesto, retiro…)</option>}
        {!entra && <option value="transferencia">Transferencia a otra cuenta mía</option>}
        <option value="mov">Un movimiento que ya cargué</option>
      </select>
      {tipo === 'mov' ? (
        <select className={cn(CONTROL_FILTRO, 'w-full')} value={movId ?? ''} onChange={(e) => setMovId(e.target.value ? Number(e.target.value) : null)} aria-label="Movimiento">
          <option value="">Elegí…</option>
          {sueltos.map((m) => (
            <option key={m.id} value={m.id}>
              {fecha(m.fecha)} · {dinero(m.monto, m.moneda)} · {m.detalle}
            </option>
          ))}
        </select>
      ) : tipo === 'transferencia' ? (
        <select className={cn(CONTROL_FILTRO, 'w-full')} value={destino ?? ''} onChange={(e) => setDestino(e.target.value ? Number(e.target.value) : null)} aria-label="Hacia">
          <option value="">Hacia…</option>
          {(cuentas ?? [])
            .filter((c) => c.id !== cuenta.id && c.activa && c.moneda === cuenta.moneda)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
        </select>
      ) : (
        <>
          <select className={cn(CONTROL_FILTRO, 'w-full')} value={cuentaId ?? ''} onChange={(e) => setCuentaId(e.target.value ? Number(e.target.value) : null)} aria-label="Cuenta contable">
            <option value="">Cuenta contable…</option>
            <OpcionesCuentas cuentas={cuentasParaMovimiento(plan ?? [])} />
          </select>
          <input className={cn(CONTROL_FILTRO, 'w-full')} value={desc} maxLength={200} onChange={(e) => setDesc(e.target.value)} aria-label="Descripción" />
        </>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          className={cn(BOTON_PRIMARIO, 'h-8 px-3 text-xs')}
          disabled={crear.isPending || conciliar.isPending}
          onClick={async () => {
            onError(null);
            const r =
              tipo === 'mov'
                ? await conciliar.mutateAsync({ lineaId: linea.id, movimientoId: movId ?? 0 })
                : await crear.mutateAsync({
                    lineaId: linea.id,
                    tipo,
                    facturaId: null,
                    gastoId: null,
                    cuentaId: tipo === 'transferencia' ? null : cuentaId,
                    destinoId: tipo === 'transferencia' ? destino : null,
                    montoDestino: null,
                    descripcion: tipo === 'transferencia' ? null : desc,
                  });
            if (r.ok) onListo();
            else onError(r.error);
          }}
        >
          Listo
        </button>
        <button type="button" className={cn(BOTON_SECUNDARIO, 'h-8 px-3 text-xs')} onClick={onListo}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
