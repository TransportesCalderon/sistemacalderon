'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Copy, FileText, Landmark, LoaderCircle, Pencil, Save, Trash2, Upload } from 'lucide-react';
import { useEnvio } from '@/modules/catalogos/components/comun';
import { ErrorBase } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { nombrePeriodo } from '@/modules/chofer/domain/chofer.types';
import { usePeriodoDe } from '@/modules/chofer/queries/hooks';
import { formatearFechaDia, hoyEnZona } from '@/shared/lib/fechas';
import { cuentaParaCopiar } from '@/modules/chofer/domain/cuenta-transferencia';
import { useCuentasTransferencia } from '@/modules/chofer/components/use-cuentas';
import { idAleatorio, prepararArchivo } from '@/shared/lib/archivo';
import { cn } from '@/shared/lib/cn';
import { browserDb } from '@/shared/supabase/browser';
import { BOTON_ICONO, BOTON_PRIMARIO, BOTON_SECUNDARIO } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { clp } from '../domain/legal.types';
import {
  ETIQUETA_ESTADO_TRAMO,
  moverPeriodo,
  type BonoDesempeno,
  type DiaTrabajado,
  type Liquidacion,
  type Renglon,
  type TramoLiquidacion,
} from '../domain/liquidacion.types';
import {
  useDiasTrabajados,
  useGuardarBonoColaboradores,
  useGuardarBonoDesempeno,
  useGuardarDiaTrabajado,
  useGuardarTramo,
  useQuitarBonoColaboradores,
} from '../queries/hooks';
import { FilaDesplegable, useFilaAbierta } from '@/shared/ui/fila-desplegable';

const BUCKET = 'documentos-rrhh';

/**
 * Liquidación en 3 pasos dentro de la ficha:
 *   1. Novedades (lo que se manda a Colaboradores): básico, bono por viaje, viáticos, adicional por km, bono por desempeño.
 *   2. Bono de sueldo de Colaboradores: RRHH carga los totales y el PDF.
 *   3. Descuentos internos y monto a transferir.
 */
export function PasosLiquidacion({ l }: { l: Liquidacion }) {
  return (
    <div className="space-y-4">
      <PasoNovedades l={l} />
      <PasoBonoSueldo l={l} />
      <PasoTransferencia l={l} />
    </div>
  );
}

function Paso({ n, titulo, listo, children, extra }: { n: number; titulo: string; listo: boolean; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border border-borde p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold text-tinta">
          <span
            className={cn(
              'inline-flex size-6 items-center justify-center rounded-full text-xs',
              listo ? 'bg-exito text-white' : 'bg-marca-suave text-marca',
            )}
          >
            {listo ? <Check className="size-3.5" /> : n}
          </span>
          {titulo}
        </h3>
        {extra}
      </div>
      {children}
    </section>
  );
}

function Fila({ t, v, fuerte = false, rojo = false }: { t: React.ReactNode; v: string; fuerte?: boolean; rojo?: boolean }) {
  return (
    <div className={cn('flex justify-between gap-3 border-b border-borde py-1 text-sm', fuerte && 'font-semibold text-tinta', rojo && 'text-error')}>
      <span className={cn(!fuerte && 'text-tinta-suave')}>{t}</span>
      <span className="tabular-nums">{v}</span>
    </div>
  );
}

// ─── Paso 1 ────────────────────────────────────────────────────────────────
const NOMBRE_NOVEDAD: Record<string, string> = {
  SUELDO_FIJO: 'Básico',
  CANON: 'Bono por tramo',
  KM: 'Adicional por km',
  VIATICO: 'Viáticos',
  BONO_DESEMPENO: 'Bono por desempeño',
};
const etiquetaRenglon = (r: Renglon) => {
  const base = NOMBRE_NOVEDAD[r.codigo];
  if (!base) return r.descripcion;
  const detalle = /\(([^)]*)\)/.exec(r.descripcion)?.[1];
  return detalle ? `${base} (${detalle})` : base;
};

function PasoNovedades({ l }: { l: Liquidacion }) {
  const imponibles = l.renglones.filter((r) => r.tipo === 'remunerativo');
  const noImponibles = l.renglones.filter((r) => r.tipo === 'no_remunerativo' && r.codigo !== 'REINTEGRO');
  const totalImp = imponibles.reduce((a, r) => a + r.importe, 0);
  const totalNoImp = noImponibles.reduce((a, r) => a + r.importe, 0);
  const puede = useCan('liquidacion.liquidaciones:editar') && l.estado === 'borrador';
  return (
    <Paso n={1} titulo="Novedades (para Colaboradores)" listo={totalImp + totalNoImp > 0}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-semibold tracking-wide text-tinta-suave uppercase">Imponible</p>
          {imponibles.length === 0 && <p className="text-sm text-tinta-suave">Nada.</p>}
          {imponibles.map((r) => (
            <Fila key={r.id} t={etiquetaRenglon(r)} v={clp(r.importe)} />
          ))}
          <Fila t="Total imponible" v={clp(totalImp)} fuerte />
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold tracking-wide text-tinta-suave uppercase">No imponible</p>
          {noImponibles.length === 0 && <p className="text-sm text-tinta-suave">Nada.</p>}
          {noImponibles.map((r) => (
            <Fila key={r.id} t={etiquetaRenglon(r)} v={clp(r.importe)} />
          ))}
          <Fila t="Total no imponible" v={clp(totalNoImp)} fuerte />
        </div>
      </div>
      <TramosDelPeriodo l={l} />
      <details className="rounded-lg bg-fondo/40 p-3" open={l.estado === 'borrador'}>
        <summary className="cursor-pointer text-sm font-medium text-tinta">
          Días trabajados: {l.diasTrabajados.filter((d) => d.trabajado).length} de {l.diasTrabajados.length} · viático {clp(l.viaticoDia)} por día
        </summary>
        <div className="mt-3">
          <CalendarioDias choferId={l.choferId} dias={l.diasTrabajados} puedeEditar={puede} />
        </div>
      </details>
      {l.bonoDesempeno?.aplica && <BonoDesempenoTarjeta l={l} b={l.bonoDesempeno} />}
    </Paso>
  );
}

/**
 * Liquidación por tramo: cada tramo de los viajes del chofer se liquida una vez. Tocar un tramo abre debajo
 * qué hacer con él: dejarlo, ajustar bono y km para esta liquidación, o «no se liquida acá».
 */
function TramosDelPeriodo({ l }: { l: Liquidacion }) {
  const puede = useCan('liquidacion.liquidaciones:editar') && l.estado === 'borrador';
  const fila = useFilaAbierta<number>();
  const guardar = useGuardarTramo();
  const envio = useEnvio();
  const [marcados, setMarcados] = useState<number[]>([]);
  const [motivo, setMotivo] = useState('Liquidado en octubre por fuera del sistema');
  const [avance, setAvance] = useState<string | null>(null);
  const elegibles = l.tramos.filter((t) => t.estado !== 'en_otra' && t.estado !== 'despues_baja');
  const marcar = (id: number) => setMarcados((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  /** Varios tramos a la vez: «no se liquida acá» (liquidar = false) o volver a lo del viaje (null). */
  const aplicar = async (liquidar: boolean | null) => {
    envio.setError(null);
    for (const [i, id] of marcados.entries()) {
      setAvance(`${i + 1} de ${marcados.length}…`);
      const res = await guardar.mutateAsync({ itemId: id, liquidar, canon: null, moneda: null, km: null, motivo });
      if (!res.ok) {
        envio.setError(res.error);
        setAvance(null);
        return;
      }
    }
    setAvance(null);
    setMarcados([]);
  };
  const incluidos = l.tramos.filter((t) => t.estado === 'incluido');
  const km = incluidos.reduce((a, t) => a + (t.km ?? 0), 0);
  const bono = incluidos.reduce((a, t) => a + (t.canonBase ?? 0), 0);
  return (
    <details className="rounded-lg bg-fondo/40 p-3" open>
      <summary className="cursor-pointer text-sm font-medium text-tinta">
        Tramos: {incluidos.length} se liquidan · {clp(km)} km · bono por tramo {clp(bono)}
        {l.bajaChofer && <span className="text-alerta"> · baja del chofer {formatearFechaDia(l.bajaChofer)}</span>}
      </summary>
      {l.tramos.length === 0 ? (
        <p className="mt-2 text-sm text-tinta-suave">Operaciones no registró movimientos terminados de este chofer en el período.</p>
      ) : (
        <div className="mt-2 space-y-2 overflow-x-auto">
          {puede && (
            <div className="flex flex-wrap items-end gap-2 rounded-lg border border-borde bg-panel p-2 text-sm">
              <span className="self-center text-tinta-suave">
                {marcados.length === 0 ? 'Tildá los tramos que ya se pagaron (por ejemplo, en octubre) para sacarlos de un saque.' : `${marcados.length} tramo(s) tildado(s)`}
              </span>
              {marcados.length > 0 && (
                <>
                  <Campo label="Por qué">
                    <input value={motivo} maxLength={300} onChange={(e) => setMotivo(e.target.value)} />
                  </Campo>
                  <button type="button" className={BOTON_PRIMARIO} disabled={guardar.isPending} onClick={() => void aplicar(false)}>
                    {guardar.isPending && <LoaderCircle className="size-4 animate-spin" />} {avance ?? 'No se liquidan acá'}
                  </button>
                  <button type="button" className={BOTON_SECUNDARIO} disabled={guardar.isPending} onClick={() => void aplicar(null)}>
                    Volver a liquidarlos
                  </button>
                  <button type="button" className="text-tinta-suave hover:underline" onClick={() => setMarcados([])}>
                    Destildar
                  </button>
                </>
              )}
            </div>
          )}
          <ErrorBase error={envio.error} />
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-borde text-left text-xs text-tinta-suave uppercase">
                {puede && (
                  <th className="w-8 py-1">
                    <input
                      type="checkbox"
                      aria-label="Tildar todos"
                      checked={elegibles.length > 0 && marcados.length === elegibles.length}
                      onChange={(e) => setMarcados(e.target.checked ? elegibles.map((t) => t.itemId) : [])}
                    />
                  </th>
                )}
                <th className="py-1 pr-3 font-semibold">Operación</th>
                <th className="py-1 pr-3 font-semibold">Tramo</th>
                <th className="py-1 pr-3 font-semibold">Salida · llegada del tramo</th>
                <th className="py-1 pr-3 text-right font-semibold">Km</th>
                <th className="py-1 pr-3 text-right font-semibold">Bono</th>
                <th className="py-1 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {l.tramos.map((t) => (
                <FilaDesplegable
                  key={t.itemId}
                  abierta={fila.es(t.itemId)}
                  onAlternar={() => fila.alternar(t.itemId)}
                  columnas={puede ? 7 : 6}
                  className={cn(t.estado !== 'incluido' && 'text-tinta-suave opacity-70')}
                  detalle={<DecidirTramo t={t} puede={puede} onListo={fila.cerrar} />}
                >
                  {puede && (
                    <td className="py-1.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Tildar ${t.viaje} ${t.linea ?? ''}`}
                        disabled={t.estado === 'en_otra' || t.estado === 'despues_baja'}
                        checked={marcados.includes(t.itemId)}
                        onChange={() => marcar(t.itemId)}
                      />
                    </td>
                  )}
                  <td className="py-1.5 pr-3 font-medium">{t.viaje}</td>
                  <td className="py-1.5 pr-3">
                    {t.recorrido ?? '—'}
                    {t.linea && <span className="block text-xs text-tinta-suave">{t.linea}</span>}
                  </td>
                  <td
                    className="py-1.5 pr-3 tabular-nums"
                    title={`Viaje: ${t.viajeSalida ? formatearFechaDia(t.viajeSalida) : '—'} · ${t.viajeLlegada ? formatearFechaDia(t.viajeLlegada) : '—'}`}
                  >
                    {t.salida ? formatearFechaDia(t.salida) : '—'} · {t.llegada ? formatearFechaDia(t.llegada) : '—'}
                    {t.fuenteFecha === 'estimada' && <span className="block text-xs text-tinta-suave">estimada por km (sin fechas en la operación)</span>}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{t.km === null ? '—' : clp(t.km)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{clp(t.canonBase)}</td>
                  <td className="py-1.5">
                    <span
                      className={cn(
                        'text-xs font-semibold',
                        t.estado === 'incluido' ? (t.detalle ? 'text-alerta' : 'text-exito') : t.estado === 'sin_linea' ? 'text-alerta' : 'text-tinta-suave',
                      )}
                    >
                      {t.ajustado ? 'Ajustado' : ETIQUETA_ESTADO_TRAMO[t.estado]}
                    </span>
                    {t.detalle && <span className="block text-xs text-tinta-suave">{t.detalle}</span>}
                  </td>
                </FilaDesplegable>
              ))}
              <tr className="font-semibold text-tinta">
                <td className="py-1.5 pr-3" colSpan={puede ? 4 : 3}>
                  Total que se liquida
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{clp(km)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{clp(bono)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}

function DecidirTramo({ t, puede, onListo }: { t: TramoLiquidacion; puede: boolean; onListo: () => void }) {
  const guardar = useGuardarTramo();
  const envio = useEnvio();
  const [v, setV] = useState({
    canon: t.canon === null ? '' : String(t.canon),
    moneda: t.canonMoneda ?? 'CLP',
    km: t.km === null ? '' : String(t.km),
    motivo: t.motivo ?? '',
  });
  if (!puede) return <p className="text-sm text-tinta-suave">{t.detalle ?? 'Se liquida con el bono y los km del viaje.'}</p>;
  if (t.estado === 'en_otra' || t.estado === 'despues_baja') return <p className="text-sm text-tinta-suave">{t.detalle}</p>;
  const enviar = (liquidar: boolean | null, conAjuste = false) =>
    void envio.enviar(
      guardar.mutateAsync({
        itemId: t.itemId,
        liquidar,
        canon: conAjuste ? v.canon : null,
        moneda: conAjuste ? v.moneda : null,
        km: conAjuste ? v.km : null,
        motivo: v.motivo,
      }),
      onListo,
    );
  return (
    <div className="space-y-3 text-sm">
      <p className="text-tinta-suave">
        Si no hay una línea con este recorrido o el bono no es el de la línea, poné el bono y los km. Si ya se pagó por fuera del sistema o no
        corresponde pagarlo, marcalo como «No se liquida acá». No cambia lo que registró Operaciones.
      </p>
      <div className="grid gap-3 sm:grid-cols-4">
        <Campo label="Bono del tramo">
          <input inputMode="decimal" value={v.canon} onChange={(e) => setV({ ...v, canon: e.target.value })} />
        </Campo>
        <Campo label="Moneda">
          <select value={v.moneda} onChange={(e) => setV({ ...v, moneda: e.target.value })}>
            {['CLP', 'ARS', 'USD'].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </Campo>
        <Campo label="Km">
          <input inputMode="decimal" value={v.km} onChange={(e) => setV({ ...v, km: e.target.value })} />
        </Campo>
        <Campo label="Por qué">
          <input value={v.motivo} maxLength={300} placeholder="Ej.: liquidado en octubre" onChange={(e) => setV({ ...v, motivo: e.target.value })} />
        </Campo>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={BOTON_PRIMARIO} disabled={guardar.isPending} onClick={() => enviar(true, true)}>
          {guardar.isPending && <LoaderCircle className="size-4 animate-spin" />} Liquidar con estos números
        </button>
        <button type="button" className={BOTON_SECUNDARIO} disabled={guardar.isPending} onClick={() => enviar(false)}>
          No se liquida acá
        </button>
        {(t.estado === 'no_se_liquida' || t.ajustado) && (
          <button type="button" className={BOTON_SECUNDARIO} disabled={guardar.isPending} onClick={() => enviar(null)}>
            Volver a lo de Operaciones
          </button>
        )}
      </div>
      <ErrorBase error={envio.error} />
    </div>
  );
}

const DIAS_SEMANA = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const FUENTE: Record<string, string> = { viaje: 'Viaje', operacion: 'Movimiento asignado', gps: 'GPS' };

/** Calendario del período: verde = trabajado (paga viático). Tocar un día para corregirlo. */
export function CalendarioDias({
  choferId,
  dias,
  puedeEditar,
  desdeFlota = false,
}: {
  choferId: number;
  dias: DiaTrabajado[];
  puedeEditar: boolean;
  desdeFlota?: boolean;
}) {
  const [elegido, setElegido] = useState<string | null>(null);
  const dia = dias.find((d) => d.fecha === elegido) ?? null;
  if (dias.length === 0) return <p className="text-sm text-tinta-suave">Sin días.</p>;
  const primero = new Date(`${dias[0]!.fecha}T12:00:00`);
  const hueco = (primero.getDay() + 6) % 7;
  return (
    <div className="space-y-3">
      <div className="grid max-w-md grid-cols-7 gap-1 text-center text-xs">
        {DIAS_SEMANA.map((d, i) => (
          <span key={i} className="text-tinta-suave">
            {d}
          </span>
        ))}
        {Array.from({ length: hueco }).map((_, i) => (
          <span key={`h${i}`} />
        ))}
        {dias.map((d) => (
          <button
            key={d.fecha}
            type="button"
            title={[d.trabajado ? 'Trabajado' : 'Descanso', d.detalle, d.motivo ? `Corregido: ${d.motivo}` : null].filter(Boolean).join(' · ')}
            onClick={() => setElegido(elegido === d.fecha ? null : d.fecha)}
            className={cn(
              'rounded-md py-1.5 tabular-nums',
              d.trabajado ? 'bg-exito/15 font-semibold text-exito' : 'bg-fondo text-tinta-suave',
              d.motivo && 'ring-2 ring-alerta',
              elegido === d.fecha && 'outline outline-2 outline-marca',
            )}
          >
            {Number(d.fecha.slice(8, 10))}
          </button>
        ))}
      </div>
      <p className="text-xs text-tinta-suave">
        Verde = trabajado (viaje, movimiento asignado o manejó ese día). Gris = descanso. Con borde naranja = corregido a mano.
      </p>
      {dia && <CorregirDia key={dia.fecha} choferId={choferId} dia={dia} puedeEditar={puedeEditar} desdeFlota={desdeFlota} onListo={() => setElegido(null)} />}
    </div>
  );
}

function CorregirDia({
  choferId,
  dia,
  puedeEditar,
  desdeFlota,
  onListo,
}: {
  choferId: number;
  dia: DiaTrabajado;
  puedeEditar: boolean;
  desdeFlota: boolean;
  onListo: () => void;
}) {
  const guardar = useGuardarDiaTrabajado(desdeFlota);
  const envio = useEnvio();
  const [motivo, setMotivo] = useState('');
  const fecha = new Date(`${dia.fecha}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  const enviar = (trabajado: boolean | null) =>
    void envio.enviar(guardar.mutateAsync({ choferId, fecha: dia.fecha, trabajado, motivo }), onListo);
  return (
    <div className="space-y-2 rounded-lg border border-borde p-3 text-sm">
      <p className="font-medium text-tinta first-letter:uppercase">
        {fecha}: {dia.trabajado ? 'trabajado' : 'descanso'}
      </p>
      <p className="text-tinta-suave">
        El sistema {dia.propuesto ? `lo ve trabajado (${FUENTE[dia.fuente ?? ''] ?? ''}${dia.detalle ? `: ${dia.detalle}` : ''})` : 'no ve movimientos ese día'}.
        {dia.motivo && ` Corregido a mano: ${dia.motivo}.`}
      </p>
      {puedeEditar && (
        <>
          <Campo label="Por qué lo cambiás">
            <input
              value={motivo}
              maxLength={300}
              placeholder={dia.trabajado ? 'Ej.: estuvo de descanso, el camión lo movió otro' : 'Ej.: movió semirremolques en la base'}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </Campo>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={BOTON_PRIMARIO} disabled={guardar.isPending} onClick={() => enviar(!dia.trabajado)}>
              {guardar.isPending && <LoaderCircle className="size-4 animate-spin" />}
              {dia.trabajado ? 'Marcar como descanso' : 'Marcar como trabajado'}
            </button>
            {dia.motivo && (
              <button type="button" className={BOTON_SECUNDARIO} disabled={guardar.isPending} onClick={() => enviar(null)}>
                Volver a lo que dice el sistema
              </button>
            )}
          </div>
          <ErrorBase error={envio.error} />
        </>
      )}
    </div>
  );
}

/** Días trabajados de un chofer por período de liquidación (ficha del chofer en Flota, para Operaciones). */
export function DiasTrabajadosChofer({ choferId, puedeEditar }: { choferId: number; puedeEditar: boolean }) {
  const { zonaHoraria } = useSesion();
  const actual = usePeriodoDe(hoyEnZona(zonaHoraria));
  const [elegido, setElegido] = useState<string | null>(null);
  const periodo = elegido ?? actual.data ?? null;
  const q = useDiasTrabajados(choferId, periodo);
  if (q.isPending) return <p className="text-sm text-tinta-suave">Buscando los días…</p>;
  // Sin permiso en la base (otros roles de Flota): no se muestra
  if (q.isError || !q.data) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button type="button" className={BOTON_ICONO} aria-label="Período anterior" onClick={() => periodo && setElegido(moverPeriodo(periodo, -1))}>
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-sm font-medium text-tinta">
          {periodo ? nombrePeriodo(periodo) : ''} · del {formatearFechaDia(q.data.desde)} al {formatearFechaDia(q.data.hasta)}
        </span>
        <button type="button" className={BOTON_ICONO} aria-label="Período siguiente" onClick={() => periodo && setElegido(moverPeriodo(periodo, 1))}>
          <ChevronRight className="size-4" />
        </button>
      </div>
      <p className="text-sm text-tinta-suave">
        {q.data.dias.filter((d) => d.trabajado).length} día(s) trabajado(s) · viático {clp(q.data.viaticoDia)} por día
        {q.data.bloqueado && ' · la liquidación ya está aprobada: no se puede cambiar'}
      </p>
      <CalendarioDias choferId={choferId} dias={q.data.dias} puedeEditar={puedeEditar && !q.data.bloqueado} desdeFlota />
    </div>
  );
}

const siNo = (v: boolean | null) => (v === null ? '—' : v ? 'Sí' : 'No');

function BonoDesempenoTarjeta({ l, b }: { l: Liquidacion; b: BonoDesempeno }) {
  const puede = useCan('liquidacion.liquidaciones:editar') && l.estado === 'borrador';
  const guardar = useGuardarBonoDesempeno();
  const envio = useEnvio();
  const [v, setV] = useState({ cuidado: b.cuidadoUnidad, limpieza: b.limpieza, motivo: b.motivo ?? '' });
  useEffect(() => setV({ cuidado: b.cuidadoUnidad, limpieza: b.limpieza, motivo: b.motivo ?? '' }), [b.cuidadoUnidad, b.limpieza, b.motivo]);
  const cumple = b.cumpleConsumo === true && b.sinFaltantes === true && v.cuidado === true && v.limpieza === true;
  const enviar = (otorgar: boolean) =>
    void envio.enviar(guardar.mutateAsync({ id: l.id, cuidado: v.cuidado, limpieza: v.limpieza, otorgar, motivo: v.motivo }), () => undefined);
  return (
    <div className="space-y-2 rounded-lg border border-borde p-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium text-tinta">Bono por desempeño ({clp(b.importe)})</p>
        <span className={cn('text-xs font-semibold', b.otorgar ? 'text-exito' : 'text-tinta-suave')}>
          {b.otorgar ? 'Se paga' : b.confirmado ? 'No se paga' : 'Sin confirmar'}
        </span>
      </div>
      <ul className="grid gap-1 sm:grid-cols-2">
        <li>
          Consumo: {b.consumo === null ? 'sin datos' : `${b.consumo.toLocaleString('es-AR')} L/100 km`} (objetivo ≤ {b.consumoMax}) →{' '}
          <strong>{siNo(b.cumpleConsumo)}</strong>
        </li>
        <li>
          Faltantes: {b.faltanteL.toLocaleString('es-AR')} L → <strong>{b.sinFaltantes === null ? '—' : b.sinFaltantes ? 'Sin faltantes' : 'Tiene'}</strong>
        </li>
        {b.cierresPendientes > 0 && <li className="text-alerta sm:col-span-2">{b.cierresPendientes} cierre(s) del período sin aprobar: el consumo puede cambiar.</li>}
      </ul>
      {puede ? (
        <>
          <div className="flex flex-wrap gap-4">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={v.cuidado === true} onChange={(e) => setV({ ...v, cuidado: e.target.checked })} /> Cuidó la unidad
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={v.limpieza === true} onChange={(e) => setV({ ...v, limpieza: e.target.checked })} /> Limpieza e higiene
            </label>
          </div>
          {!cumple && (
            <Campo label="Si se lo das sin cumplir todo, por qué">
              <input value={v.motivo} maxLength={300} onChange={(e) => setV({ ...v, motivo: e.target.value })} />
            </Campo>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={BOTON_PRIMARIO} disabled={guardar.isPending} onClick={() => enviar(true)}>
              {guardar.isPending && <LoaderCircle className="size-4 animate-spin" />} Pagar el bono
            </button>
            <button type="button" className={BOTON_SECUNDARIO} disabled={guardar.isPending} onClick={() => enviar(false)}>
              No se paga
            </button>
          </div>
          <ErrorBase error={envio.error} />
        </>
      ) : (
        <p className="text-tinta-suave">
          Cuidado de la unidad: {siNo(b.cuidadoUnidad)} · Limpieza: {siNo(b.limpieza)}
          {b.motivo && ` · ${b.motivo}`}
        </p>
      )}
    </div>
  );
}

// ─── Paso 2 ────────────────────────────────────────────────────────────────
const CAMPOS_BONO = [
  ['imponible', 'Total imponible (con la gratificación)'],
  ['gratificacion', 'Gratificación'],
  ['noImponible', 'Total no imponible'],
  ['afp', 'AFP'],
  ['salud', 'Salud (Fonasa / Isapre)'],
  ['cesantia', 'Seguro de cesantía'],
  ['impuesto', 'Impuesto único'],
  ['otrosDescuentos', 'Otros descuentos legales'],
  ['liquido', 'Líquido a pagar'],
  ['aporteEmpleador', 'Aportes de la empresa (opcional)'],
] as const;
type CampoBono = (typeof CAMPOS_BONO)[number][0];
const aNum = (t: string) => Number(t.replace(/[^\d]/g, '') || 0);

function PasoBonoSueldo({ l }: { l: Liquidacion }) {
  const puede = useCan('liquidacion.liquidaciones:editar') && l.estado === 'borrador';
  const g = l.legal;
  const c = l.colaboradores;
  const cargado = g?.fuente === 'colaboradores';
  const [editando, setEditando] = useState(false);
  const quitar = useQuitarBonoColaboradores();
  const envio = useEnvio();
  const [aviso, setAviso] = useState<string | null>(null);

  const verPdf = async () => {
    if (!c?.pdfRuta) return;
    const ventana = window.open('', '_blank');
    const { data, error } = await browserDb().storage.from(BUCKET).createSignedUrl(c.pdfRuta, 300);
    if (error || !data) {
      ventana?.close();
      setAviso(error?.message ?? 'No se pudo abrir el PDF.');
    } else if (ventana) ventana.location.href = data.signedUrl;
  };

  return (
    <Paso
      n={2}
      titulo="Bono de sueldo de Colaboradores"
      listo={cargado && (g?.faltan.length ?? 0) === 0}
      extra={
        cargado && c?.pdfRuta ? (
          <button type="button" className="inline-flex items-center gap-1 text-sm text-marca hover:underline" onClick={() => void verPdf()}>
            <FileText className="size-4" /> Ver el PDF
          </button>
        ) : null
      }
    >
      {g && g.faltan.length > 0 && !g.bonoPendiente && (
        <ul className="space-y-1 rounded-lg bg-alerta-suave p-3 text-sm text-alerta">
          {g.faltan.map((f) => (
            <li key={f} className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {f}
            </li>
          ))}
        </ul>
      )}
      {g && g.avisos.length > 0 && (
        <ul className="space-y-1 text-sm text-alerta">
          {g.avisos.map((f) => (
            <li key={f} className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {f}
            </li>
          ))}
        </ul>
      )}
      {cargado && c && !editando ? (
        <>
          <div className="grid gap-x-6 sm:grid-cols-2">
            <Fila t="Total imponible" v={clp(c.imponible)} />
            <Fila t="de eso, gratificación" v={clp(c.gratificacion)} />
            <Fila t="Total no imponible" v={clp(c.noImponible)} />
            <Fila t="AFP" v={clp(c.afp)} rojo />
            <Fila t="Salud" v={clp(c.salud)} rojo />
            <Fila t="Seguro de cesantía" v={clp(c.cesantia)} rojo />
            <Fila t="Impuesto único" v={clp(c.impuesto)} rojo />
            {c.otrosDescuentos > 0 && <Fila t="Otros descuentos legales" v={clp(c.otrosDescuentos)} rojo />}
            <Fila t="Líquido del bono" v={clp(c.liquido)} fuerte />
            {c.aporteEmpleador > 0 && <Fila t="Aportes de la empresa" v={clp(c.aporteEmpleador)} />}
          </div>
          {puede && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className={BOTON_SECUNDARIO} onClick={() => setEditando(true)}>
                <Pencil className="size-4" /> Corregir
              </button>
              <button
                type="button"
                className={BOTON_SECUNDARIO}
                disabled={quitar.isPending}
                onClick={() => void envio.enviar(quitar.mutateAsync({ id: l.id }), () => undefined)}
              >
                <Trash2 className="size-4" /> Quitar el bono
              </button>
            </div>
          )}
        </>
      ) : puede ? (
        <FormBono l={l} onListo={() => setEditando(false)} onCancelar={cargado ? () => setEditando(false) : undefined} />
      ) : (
        <p className="text-sm text-tinta-suave">Todavía no se cargó el bono de sueldo.</p>
      )}
      {aviso && <p className="text-sm text-error">{aviso}</p>}
      <ErrorBase error={envio.error} />
    </Paso>
  );
}

function FormBono({ l, onListo, onCancelar }: { l: Liquidacion; onListo: () => void; onCancelar?: () => void }) {
  const c = l.colaboradores;
  const g = l.legal;
  const novImp = g?.novedadesImponible ?? l.remunerativo;
  const novNoImp = g?.novedadesNoImponible ?? l.noRemunerativo;
  const guardar = useGuardarBonoColaboradores();
  const envio = useEnvio();
  const input = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [v, setV] = useState<Record<CampoBono, string>>(() => ({
    imponible: String(c?.imponible ?? Math.round(novImp)),
    gratificacion: String(c?.gratificacion ?? ''),
    noImponible: String(c?.noImponible ?? Math.round(novNoImp)),
    afp: String(c?.afp ?? ''),
    salud: String(c?.salud ?? ''),
    cesantia: String(c?.cesantia ?? ''),
    impuesto: String(c?.impuesto ?? ''),
    otrosDescuentos: String(c?.otrosDescuentos ?? ''),
    liquido: String(c?.liquido ?? ''),
    aporteEmpleador: String(c?.aporteEmpleador ?? ''),
  }));
  const desc = aNum(v.afp) + aNum(v.salud) + aNum(v.cesantia) + aNum(v.impuesto) + aNum(v.otrosDescuentos);
  const calculado = aNum(v.imponible) + aNum(v.noImponible) - desc;
  const cierra = v.liquido.trim() !== '' && Math.abs(calculado - aNum(v.liquido)) <= 1;

  const guardarTodo = async () => {
    setAviso(null);
    let ruta: string | null = null;
    if (archivo) {
      setSubiendo(true);
      try {
        const { blob, extension, tipo } = await prepararArchivo(archivo);
        if (blob.size > 15 * 1024 * 1024) throw new Error('El archivo supera los 15 MB.');
        ruta = `liquidaciones/${l.id}/bono-${idAleatorio()}.${extension.toLowerCase().replace(/[^a-z0-9]/g, '') || 'pdf'}`;
        const r = await browserDb().storage.from(BUCKET).upload(ruta, blob, { contentType: tipo, upsert: false });
        if (r.error) throw new Error(`No se pudo subir el PDF: ${r.error.message}`);
      } catch (e) {
        setAviso(e instanceof Error ? e.message : 'No se pudo subir el PDF.');
        setSubiendo(false);
        return;
      }
      setSubiendo(false);
    }
    await envio.enviar(guardar.mutateAsync({ id: l.id, ...v, pdfRuta: ruta }), onListo);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-tinta-suave">
        Copiá los totales del bono que mandó Colaboradores. Las novedades fueron: imponible <strong>{clp(novImp)}</strong> y no imponible{' '}
        <strong>{clp(novNoImp)}</strong> (el imponible del bono suma además la gratificación).
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {CAMPOS_BONO.map(([k, t]) => (
          <Campo key={k} label={t}>
            <input inputMode="numeric" value={v[k]} placeholder="0" onChange={(e) => setV({ ...v, [k]: e.target.value })} />
          </Campo>
        ))}
      </div>
      <p className={cn('text-sm', cierra ? 'text-exito' : 'text-tinta-suave')}>
        Imponible + no imponible − descuentos = {clp(calculado)}
        {v.liquido.trim() !== '' && (cierra ? ' · coincide con el líquido' : ` · el líquido dice ${clp(aNum(v.liquido))}`)}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={input}
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          onChange={(e) => {
            setArchivo(e.target.files?.[0] ?? null);
            e.target.value = '';
          }}
        />
        <button type="button" className={BOTON_SECUNDARIO} onClick={() => input.current?.click()}>
          <Upload className="size-4" /> {archivo ? archivo.name : c?.pdfRuta ? 'Reemplazar el PDF del bono' : 'Adjuntar el PDF del bono'}
        </button>
        <button type="button" className={BOTON_PRIMARIO} disabled={guardar.isPending || subiendo} onClick={() => void guardarTodo()}>
          {guardar.isPending || subiendo ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />} Guardar el bono
        </button>
        {onCancelar && (
          <button type="button" className="text-sm text-tinta-suave hover:underline" onClick={onCancelar}>
            Cancelar
          </button>
        )}
      </div>
      {aviso && <p className="text-sm text-error">{aviso}</p>}
      <ErrorBase error={envio.error} />
    </div>
  );
}

// ─── Paso 3 ────────────────────────────────────────────────────────────────
function PasoTransferencia({ l }: { l: Liquidacion }) {
  const g = l.legal;
  const descuentos = l.renglones.filter((r) => r.tipo === 'descuento');
  const reintegros = l.renglones.filter((r) => r.codigo === 'REINTEGRO' && r.tipo !== 'descuento');
  const conBono = g?.fuente === 'colaboradores';
  return (
    <Paso n={3} titulo="Descuentos y transferencia" listo={l.estado === 'pagada'}>
      <div className="grid gap-x-6 sm:grid-cols-2">
        <div>
          <Fila t="Líquido del bono de sueldo" v={conBono ? clp(g?.liquido) : '—'} fuerte />
          {descuentos.length === 0 && <p className="py-1 text-sm text-tinta-suave">Sin descuentos.</p>}
          {descuentos.map((r) => (
            <Fila key={r.id} t={`− ${r.descripcion}`} v={clp(r.importe)} rojo />
          ))}
          {reintegros.map((r) => (
            <Fila key={r.id} t={`+ ${r.descripcion}`} v={clp(r.importe)} />
          ))}
          <div className="mt-2 flex items-center justify-between rounded-lg bg-marca-suave px-4 py-3 text-base font-semibold text-marca">
            <span>{l.estado === 'pagada' ? 'Transferido' : 'A transferir'}</span>
            <span className="tabular-nums">{conBono ? clp(g?.aPagar) : 'falta el paso 2'}</span>
          </div>
          {l.estado === 'pagada' && (
            <p className="mt-1 text-xs text-tinta-suave">
              {l.egresoNumero} · {l.pagadaEn}
              {l.pagoBanco && ` · ${l.pagoBanco}`}
              {l.pagoNumero && ` · operación ${l.pagoNumero}`}
            </p>
          )}
        </div>
        {(l.estado === 'aprobada' || l.estado === 'borrador') && <CuentaDelChofer choferId={l.choferId} moneda={l.moneda} />}
      </div>
    </Paso>
  );
}

function CuentaDelChofer({ choferId, moneda }: { choferId: number; moneda: string }) {
  const q = useCuentasTransferencia(choferId);
  const [copiado, setCopiado] = useState(false);
  if (q.isPending || q.isError) return null;
  const cuentas = q.data.filter((c) => c.moneda === moneda);
  const c = cuentas.find((x) => x.recomendada) ?? cuentas.find((x) => x.principal) ?? cuentas[0];
  if (!c) return <p className="text-sm text-alerta">El chofer no tiene una cuenta en {moneda} cargada.</p>;
  return (
    <div className="space-y-1 rounded-lg border border-borde p-3 text-sm">
      <p className="flex items-center gap-1 font-medium text-tinta">
        <Landmark className="size-4" /> Transferir a
      </p>
      <p>
        {c.banco}
        {c.tipoCuenta && ` · ${c.tipoCuenta}`} · {c.numero}
      </p>
      <p className="text-tinta-suave">
        {c.titular}
        {c.titularDocumento && ` · ${c.titularDocumento}`}
      </p>
      {c.motivoRecomendada && <p className="text-xs text-tinta-suave">{c.motivoRecomendada}</p>}
      <button
        type="button"
        className={cn('inline-flex items-center gap-1 text-marca underline', copiado && 'text-exito')}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(cuentaParaCopiar(c));
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
          } catch {
            setCopiado(false);
          }
        }}
      >
        {copiado ? <Check className="size-4" /> : <Copy className="size-4" />} {copiado ? 'Copiada' : 'Copiar los datos'}
      </button>
    </div>
  );
}
