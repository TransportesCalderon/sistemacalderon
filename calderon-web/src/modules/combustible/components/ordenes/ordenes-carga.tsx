'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, Check, Fuel, KeyRound, Link2, Mail, Pencil, QrCode, Send, TriangleAlert, X } from 'lucide-react';
import { Cargando, Chip, ErrorLectura, Vacio, type Tono } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import { useAsegurarFotoMail } from '@/modules/flota/components/choferes/foto-chofer';
import { useSesion } from '@/modules/core/session/session-provider';
import { BotonCopiar } from '@/modules/telemetria/components/boton-copiar';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { browserDb } from '@/shared/supabase/browser';
import { probarMail, urlPermisoMail } from '../../actions/orden-carga.actions';
import { ordenCargaRepository } from '../../repositories/orden-carga.repository';
import {
  ETIQUETA_ESTADO_ORDEN,
  VERSION_ORDEN_CARGA,
  VERSION_SOLICITUD_CARGA,
  type CreadaOrden,
  type DetalleOrden,
  type EstadoOrden,
  type OrdenCarga,
  type PreparadoOrden,
  type SolicitudCarga,
} from '../../domain/orden-carga.types';
import { useCamionesCombustible, useChoferesCombustible, useEstaciones } from '../../queries/hooks';
import {
  useAnularOrdenCarga,
  useAprobarSolicitudCarga,
  useCorreoEstacion,
  useCrearOrdenCarga,
  useCrearOrdenGenset,
  useGensetsOrden,
  useOrdenesCarga,
  usePrepararGenset,
  usePrepararOrden,
  useRechazarSolicitudCarga,
  useRevisarOrdenCarga,
  useSolicitudesCarga,
} from '../../queries/orden-carga.hooks';

const TONO: Record<EstadoOrden, Tono> = { emitida: 'marca', autorizada: 'alerta', cargada: 'exito', anulada: 'neutro', bloqueada: 'error', vencida: 'neutro' };
const TH = 'px-3 py-2.5 whitespace-nowrap';
const TD = 'px-3 py-2.5 align-top';
const aNumero = (s: string) => (s.trim() === '' ? null : Number(s.replace(/\./g, '').replace(',', '.')));
const aTexto = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v).replace('.', ','));

/**
 * Migración 234 · Órdenes de carga de combustible. Gerencia autoriza una carga (litros, importe o llenar) en una
 * estación: la estación recibe el mail con la palabra de seguridad y el chofer un QR único. El playero escanea el
 * QR, escribe la palabra y confirma; el chofer termina subiendo los tickets.
 */
export function OrdenesCarga() {
  const hay = useBaseTiene(VERSION_ORDEN_CARGA);
  const configuraMail = useCan('combustible.ordenes:editar');
  // Migración 247: autoriza cargas quien tiene la marca (la pone TI en Ajustes › Usuarios)
  const conMarca = useBaseTiene(247);
  const marca = useQuery({
    queryKey: ['combustible', 'ordenes', 'puedo-autorizar'] as const,
    queryFn: async () => {
      const { data, error } = await browserDb().schema('fue').rpc('fn_puedo_autorizar_cargas');
      if (error) throw error;
      return data === true;
    },
    enabled: conMarca,
    staleTime: 60_000,
  });
  const puede = conMarca ? marca.data === true : configuraMail;
  const { zonaHoraria } = useSesion();
  const { data, isPending, isError, error, refetch } = useOrdenesCarga(hay);
  const [nueva, setNueva] = useState(false);

  if (!hay) return <Vacio icono={<QrCode className="size-6" />} texto="Falta aplicar en la base el cambio de las órdenes de carga." />;
  return (
    <div className="space-y-4">
      {/* Migración 259: solicitudes de carga pedidas desde Seguimiento de viaje, arriba de todo */}
      {!nueva && <SolicitudesPendientes puede={puede} zona={zonaHoraria} />}
      {!nueva && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-tinta-suave">
            La estación recibe un mail con la palabra de seguridad; el chofer, un QR. El playero escanea el QR, escribe la palabra y confirma la carga.
          </p>
          {puede && (
            <button type="button" className={cn(BOTON_PRIMARIO, 'h-12 w-full justify-center text-base sm:w-auto')} onClick={() => setNueva(true)}>
              <Fuel className="size-5" /> Nueva orden de carga
            </button>
          )}
        </div>
      )}
      {configuraMail && !nueva && <CuentaMail />}
      {nueva && <NuevaOrden onCerrar={() => setNueva(false)} />}
      {isPending ? (
        <Cargando texto="Leyendo las órdenes…" />
      ) : isError ? (
        <ErrorLectura texto="No se pudieron leer las órdenes de carga." error={error} onReintentar={() => void refetch()} />
      ) : data.length === 0 ? (
        <Vacio icono={<QrCode className="size-6" />} texto="Todavía no hay órdenes de carga." />
      ) : (
        <div className={cn(TARJETA, 'overflow-x-auto')}>
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b border-borde bg-fondo text-left text-xs font-medium tracking-wide text-tinta-suave uppercase">
              <tr>
                <th className={TH}>Orden</th>
                <th className={TH}>Camión y chofer</th>
                <th className={TH}>Estación</th>
                <th className={TH}>Autorizado</th>
                <th className={TH}>Estado</th>
                <th className={TH}>Cargado</th>
                <th className={TH} />
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {data.map((o) => (
                <FilaOrden key={o.id} o={o} zona={zonaHoraria} puede={puede} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilaOrden({ o, zona, puede }: { o: OrdenCarga; zona: string; puede: boolean }) {
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const anular = useAnularOrdenCarga();
  const revisar = useRevisarOrdenCarga();
  const abierta = o.estado === 'emitida' || o.estado === 'autorizada' || o.estado === 'bloqueada';
  return (
    <>
      <tr>
        <td className={TD}>
          <span className="font-mono font-semibold">{o.numero}</span>
          <span className="block text-xs text-tinta-suave">
            {formatearFechaHora(o.creadaEn, zona)}
            {o.creadaPor && ` · ${o.creadaPor}`}
          </span>
        </td>
        <td className={TD}>
          <span className="font-mono font-semibold">{o.patente}</span>
          <span className="block text-xs text-tinta-suave">{o.chofer}</span>
        </td>
        <td className={TD}>
          {o.estacion}
          <span className={cn('block text-xs', o.mailEstado === 'enviado' ? 'text-exito' : o.mailEstado ? 'text-alerta' : 'text-tinta-suave')} title={o.mailError ?? undefined}>
            <Mail className="mr-1 inline size-3" />
            {o.mailEstado === 'enviado' ? 'Mail enviado' : o.mailEstado === 'pendiente' ? 'Mail en cola' : o.mailEstado === 'error' ? 'El mail no salió' : 'Sin correo'}
          </span>
        </td>
        <td className={TD}>
          {o.autorizado}
          {o.litrosCalculados !== null && <span className="block text-xs text-tinta-suave">calculado {formatearNumero(o.litrosCalculados, 0)} L</span>}
        </td>
        <td className={TD}>
          <Chip tono={TONO[o.estado]}>{ETIQUETA_ESTADO_ORDEN[o.estado]}</Chip>
          {/* Migración 250: vence a las 24 del día; se muestra «hasta las 23:59» de ese día */}
          {o.estado === 'emitida' && (
            <span className="block text-xs text-tinta-suave">vence {formatearFechaHora(new Date(new Date(o.venceEn).getTime() - 60_000).toISOString(), zona)}</span>
          )}
          {o.autorizadaEn && <span className="block text-xs text-tinta-suave">autorizó la estación {formatearFechaHora(o.autorizadaEn, zona)}</span>}
          {o.motivoAnulacion && <span className="block text-xs text-tinta-suave">{o.motivoAnulacion}</span>}
        </td>
        <td className={cn(TD, 'tabular-nums')}>
          {o.litrosCargados !== null ? `${formatearNumero(o.litrosCargados, 0)} L` : o.cargadaEn ? 'Sin litros en el ticket' : '—'}
          {o.tickets.length > 0 && <span className="block text-xs text-tinta-suave">{o.tickets.length} ticket(s)</span>}
        </td>
        <td className={cn(TD, 'text-right')}>
          {puede && abierta && !anulando && (
            <button type="button" className="text-xs text-error hover:underline" onClick={() => setAnulando(true)}>
              Anular
            </button>
          )}
        </td>
      </tr>
      {o.alerta && (
        <tr>
          <td colSpan={7} className="px-3 pb-3">
            <div className={cn('flex flex-wrap items-center gap-2 rounded-md px-3 py-2 text-sm', o.revisadaEn ? 'bg-hover text-tinta-suave' : 'bg-alerta-suave text-alerta')}>
              <TriangleAlert className="size-4 shrink-0" />
              <span className="flex-1">{o.alerta}</span>
              {o.revisadaEn ? (
                <span className="text-xs">Revisada {formatearFechaHora(o.revisadaEn, zona)}</span>
              ) : (
                <button type="button" className={BOTON_SECUNDARIO} disabled={revisar.isPending} onClick={() => void revisar.mutateAsync({ id: o.id })}>
                  <BadgeCheck className="size-4" /> Revisada
                </button>
              )}
            </div>
          </td>
        </tr>
      )}
      {anulando && (
        <tr>
          <td colSpan={7} className="px-3 pb-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-64 flex-1">
                <Campo label="Motivo de la anulación" error={error ?? undefined}>
                  <input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                </Campo>
              </div>
              <button
                type="button"
                className="h-10 rounded-md bg-error px-3 text-sm font-medium text-white disabled:opacity-60"
                disabled={anular.isPending}
                onClick={async () => {
                  setError(null);
                  const r = await anular.mutateAsync({ id: o.id, motivo });
                  if (!r.ok) setError(r.error.mensaje);
                  else setAnulando(false);
                }}
              >
                Anular la orden
              </button>
              <button type="button" className={BOTON_SECUNDARIO} onClick={() => setAnulando(false)}>
                Cancelar
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/** Migración 259: lo que quedó en el formulario (para pedir la carga desde Seguimiento o aprobar una solicitud editada). */
export interface DatosFormularioOrden {
  camionId: number | null;
  estacionId: number | null;
  detalle: DetalleOrden | null;
  choferId: number | null;
  observacion: string | null;
  /** Litros aproximados: la suma si todo va en litros; si algo va lleno, lo que le falta al camión. */
  aproximadoL: number | null;
  prep: PreparadoOrden | undefined;
  listo: boolean;
}
type ResultadoOrden = { ok: true; data: CreadaOrden } | { ok: false; error: { mensaje: string } };

/**
 * Nueva orden de carga. Migración 259: el mismo formulario sirve para pedir la carga desde Seguimiento de viaje
 * (`camionFijo` + `pie` con cómo se manda) y para editar una solicitud antes de aprobarla (`inicial` + `generar`).
 */
export function NuevaOrden({
  onCerrar,
  camionFijo,
  inicial,
  titulo = 'Nueva orden de carga',
  pie,
  generar,
  sinChofer = false,
}: {
  onCerrar: () => void;
  camionFijo?: number;
  inicial?: { estacionId: number | null; detalle: DetalleOrden | null; choferId: number | null; observacion: string | null };
  titulo?: string;
  /** En lugar del botón «Generar la orden». */
  pie?: (d: DatosFormularioOrden) => React.ReactNode;
  /** En lugar de crear la orden (aprobar una solicitud editada). */
  generar?: (d: DatosFormularioOrden) => Promise<ResultadoOrden>;
  /** Sin elegir el chofer (quien pide la carga no lo elige: lo ve quien la aprueba). */
  sinChofer?: boolean;
}) {
  const camiones = useCamionesCombustible();
  const estaciones = useEstaciones();
  const [camion, setCamion] = useState(camionFijo ? String(camionFijo) : '');
  const [estacion, setEstacion] = useState(inicial?.estacionId ? String(inicial.estacionId) : '');
  // Migración 248: 1) solo tanques o tanques y mochila; 2) cada uno lleno o con litros
  const [tipo, setTipo] = useState<'camion' | 'genset'>('camion');
  const [destino, setDestino] = useState<DetalleOrden['destino'] | null>(inicial?.detalle?.destino ?? null);
  const [tanques, setTanques] = useState<'lleno' | 'litros' | null>(inicial?.detalle?.tanques.modo ?? null);
  const [litrosTanques, setLitrosTanques] = useState(aTexto(inicial?.detalle?.tanques.litros));
  const [mochila, setMochila] = useState<'llena' | 'litros' | null>(inicial?.detalle?.mochila?.modo ?? null);
  const [litrosMochila, setLitrosMochila] = useState(aTexto(inicial?.detalle?.mochila?.litros));
  const [obs, setObs] = useState(inicial?.observacion ?? '');
  // Otro chofer que el de la Pizarra (vacío = el de la Pizarra): es quien ve el QR en «Mi viaje»
  const [chofer, setChofer] = useState(inicial?.choferId ? String(inicial.choferId) : '');
  const choferes = useChoferesCombustible();
  const [correo, setCorreo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [creada, setCreada] = useState<CreadaOrden | null>(null);
  const prep = usePrepararOrden(camion ? Number(camion) : null, estacion ? Number(estacion) : null);
  const crear = useCrearOrdenCarga();
  const guardarCorreo = useCorreoEstacion();
  const p = prep.data;
  // Migración 246: que la foto del chofer salga en el mail aunque se haya cargado antes del cambio 232
  useAsegurarFotoMail(sinChofer ? null : chofer ? Number(chofer) : (p?.choferId ?? null));

  // Migración 252: orden para un genset (aparte)
  if (tipo === 'genset') return <NuevaOrdenGenset onCerrar={onCerrar} onTipo={setTipo} />;
  if (creada) return <OrdenCreada creada={creada} onCerrar={onCerrar} />;

  const resumen = destino
    ? `Tanques: ${tanques === 'lleno' ? 'llenos' : tanques === 'litros' ? `${litrosTanques || '…'} L` : '…'}${
        destino === 'tanques_mochila'
          ? ` · Mochila: ${
              mochila === 'llena' ? `llena${p?.capacidadMochilaL != null ? ` (${formatearNumero(p.capacidadMochilaL, 0)} L)` : ''}` : mochila === 'litros' ? `${litrosMochila || '…'} L` : '…'
            }`
          : ''
      }`
    : null;
  // Migración 249: cuántos litros aproximados (lo que le falta al camión, o la suma si todo va en litros)
  const lt = tanques === 'litros' ? aNumero(litrosTanques) : null;
  const lm = destino === 'tanques_mochila' && mochila === 'litros' ? aNumero(litrosMochila) : null;
  const algoLleno = tanques === 'lleno' || (destino === 'tanques_mochila' && mochila === 'llena');
  const aproximado = !destino
    ? null
    : !algoLleno
      ? lt !== null && (destino === 'tanques' || lm !== null)
        ? `${formatearNumero(lt + (lm ?? 0), 0)} L`
        : null
      : p?.litrosParaLlenar != null
        ? `${lt !== null || lm !== null ? 'hasta ' : ''}≈ ${formatearNumero(p.litrosParaLlenar, 0)} L`
        : null;
  const listo =
    !!camion &&
    !!estacion &&
    !!destino &&
    (tanques === 'lleno' || (tanques === 'litros' && aNumero(litrosTanques) !== null)) &&
    (destino === 'tanques' || mochila === 'llena' || (mochila === 'litros' && aNumero(litrosMochila) !== null));
  const detalle: DetalleOrden | null = destino
    ? {
        destino,
        tanques: { modo: tanques ?? 'lleno', litros: tanques === 'litros' ? aNumero(litrosTanques) : null },
        ...(destino === 'tanques_mochila' ? { mochila: { modo: mochila ?? 'llena', litros: mochila === 'litros' ? aNumero(litrosMochila) : null } } : {}),
      }
    : null;
  const datos: DatosFormularioOrden = {
    camionId: camion ? Number(camion) : null,
    estacionId: estacion ? Number(estacion) : null,
    detalle,
    choferId: chofer ? Number(chofer) : (p?.choferId ?? null),
    observacion: obs.trim() || null,
    aproximadoL: !destino ? null : !algoLleno ? (lt !== null && (destino === 'tanques' || lm !== null) ? lt + (lm ?? 0) : null) : (p?.litrosParaLlenar ?? null),
    prep: p,
    listo,
  };

  return (
    <div className={cn(TARJETA, 'mb-20 space-y-5 p-4 sm:mb-0')}>
      <div className="flex items-center justify-between">
        <p className="text-lg font-semibold text-tinta">{titulo}</p>
        <button type="button" aria-label="Cerrar" className="rounded p-1 text-tinta-suave hover:bg-hover" onClick={onCerrar}>
          <X className="size-6" />
        </button>
      </div>

      {!camionFijo && <TipoOrden valor="camion" onCambiar={setTipo} />}

      <Paso numero={1} titulo={camionFijo ? 'Estación' : 'Camión y estación'}>
        <div className="grid gap-3 sm:grid-cols-2">
          {camionFijo ? (
            <Campo label="Camión">
              <p className="flex h-12 items-center font-mono text-base font-semibold text-tinta">{p?.patente ?? '…'}</p>
            </Campo>
          ) : (
          <Campo label="Camión">
            <select className="h-12 text-base" value={camion} onChange={(e) => setCamion(e.target.value)}>
              <option value="">Elegí…</option>
              {camiones.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.patente}
                </option>
              ))}
            </select>
          </Campo>
          )}
          <Campo label="Estación de servicio">
            <select className="h-12 text-base" value={estacion} onChange={(e) => setEstacion(e.target.value)}>
              <option value="">Elegí…</option>
              {estaciones.data
                ?.filter((e) => !e.esTanquePropio)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre}
                  </option>
                ))}
            </select>
          </Campo>
        </div>
        {camion && prep.isFetching && !p && <p className="text-sm text-tinta-suave">Leyendo el camión…</p>}
        {p && (
          <div className="space-y-2 rounded-lg bg-hover p-3 text-sm text-tinta">
            {sinChofer ? (
              <p>
                Chofer: <strong>{p.chofer ?? 'sin chofer en la Pizarra'}</strong>
              </p>
            ) : (
            <Campo label="Chofer (ve el QR en «Mi viaje»)">
              <select className="h-12 text-base" value={chofer} onChange={(e) => setChofer(e.target.value)}>
                <option value="">{p.chofer ? `${p.chofer} (el de la Pizarra)` : 'Elegí… (no tiene chofer en la Pizarra)'}</option>
                {choferes.data
                  ?.filter((c) => c.id !== p.choferId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
              </select>
            </Campo>
            )}
            {p.litrosParaLlenar !== null ? (
              <p>
                Para quedar lleno le faltan <strong className="text-base">≈ {formatearNumero(p.litrosParaLlenar, 0)} L</strong>
                {p.estimacionTexto && <span className="block text-xs text-tinta-suave">({p.estimacionTexto})</span>}
              </p>
            ) : (
              <p className="text-xs text-tinta-suave">
                No se puede calcular cuánto le falta para llenar{p.estimacionTexto ? `: ${p.estimacionTexto}` : p.motivoSinCalculo ? `: ${p.motivoSinCalculo}` : ''}.
              </p>
            )}
            {p.precio !== null && (
              <p className="text-xs text-tinta-suave">
                Último precio en la estación: {p.moneda} {formatearNumero(p.precio, 2)} por litro
              </p>
            )}
            {p.vigente && <p className="font-medium text-alerta">Este camión ya tiene la orden {p.vigente} vigente: anulala antes de hacer otra.</p>}
            {/* Migración 259: solicitud pendiente desde Seguimiento */}
            {p.pendiente && !generar && (
              <p className="font-medium text-alerta">
                Este camión tiene una solicitud de carga pendiente{p.pendiente.por ? ` de ${p.pendiente.por}` : ''}
                {pie ? ': esperá que la aprueben o la rechacen.' : ': aprobala o rechazala arriba.'}
              </p>
            )}
            {estacion && !p.correo && (
              <div className="space-y-2 pt-1">
                <Campo label="Correo de la estación (no tiene)" ayuda="Sin correo no se puede generar la orden. Para varios, separalos con coma.">
                  <input type="email" className="h-12 text-base" value={correo} onChange={(e) => setCorreo(e.target.value)} />
                </Campo>
                <button
                  type="button"
                  className={cn(BOTON_SECUNDARIO, 'w-full justify-center sm:w-auto')}
                  disabled={guardarCorreo.isPending}
                  onClick={async () => {
                    setError(null);
                    const r = await guardarCorreo.mutateAsync({ estacionId: Number(estacion), correo });
                    if (!r.ok) setError(r.error.mensaje);
                    else void prep.refetch();
                  }}
                >
                  <Mail className="size-4" /> Guardar correo
                </button>
              </div>
            )}
          </div>
        )}
      </Paso>

      <Paso numero={2} titulo="¿Qué se carga?">
        <div className="grid grid-cols-2 gap-2">
          <Opcion activa={destino === 'tanques'} onClick={() => setDestino('tanques')} titulo="Solo tanques" />
          <Opcion
            activa={destino === 'tanques_mochila'}
            onClick={() => setDestino('tanques_mochila')}
            deshabilitada={p ? p.capacidadMochilaL === null : false}
            titulo="Tanques y mochila"
            detalle={p ? (p.capacidadMochilaL === null ? 'Sin mochila cargada' : `Mochila de ${formatearNumero(p.capacidadMochilaL, 0)} L`) : undefined}
          />
        </div>
      </Paso>

      {destino && (
        <Paso numero={3} titulo="Tanques">
          <div className="grid grid-cols-2 gap-2">
            <Opcion
              activa={tanques === 'lleno'}
              onClick={() => setTanques('lleno')}
              titulo="Llenos"
              detalle={p?.litrosParaLlenar != null ? `≈ ${formatearNumero(p.litrosParaLlenar, 0)} L${destino === 'tanques_mochila' ? ' con la mochila' : ''}` : undefined}
            />
            <Opcion activa={tanques === 'litros'} onClick={() => setTanques('litros')} titulo="Litros" detalle="Escribís cuántos" />
          </div>
          {tanques === 'litros' && <Litros valor={litrosTanques} onCambiar={setLitrosTanques} etiqueta="Litros para los tanques" ejemplo="100" />}
        </Paso>
      )}

      {destino === 'tanques_mochila' && (
        <Paso numero={4} titulo="Mochila">
          <div className="grid grid-cols-2 gap-2">
            <Opcion
              activa={mochila === 'llena'}
              onClick={() => setMochila('llena')}
              titulo="Llena"
              detalle={p?.capacidadMochilaL != null ? `capacidad ${formatearNumero(p.capacidadMochilaL, 0)} L` : undefined}
            />
            <Opcion activa={mochila === 'litros'} onClick={() => setMochila('litros')} titulo="Litros" detalle="Escribís cuántos" />
          </div>
          {mochila === 'litros' && <Litros valor={litrosMochila} onCambiar={setLitrosMochila} etiqueta="Litros para la mochila" ejemplo="300" />}
        </Paso>
      )}

      <Campo label="Observación (opcional)">
        <input className="h-12 text-base" maxLength={500} value={obs} onChange={(e) => setObs(e.target.value)} />
      </Campo>

      {resumen && (
        <div className="rounded-lg border border-marca/30 bg-marca-suave p-3">
          <p className="text-xs font-medium tracking-wide text-tinta-suave uppercase">{pie ? 'Vas a pedir' : 'Vas a autorizar'}</p>
          <p className="text-base font-semibold text-tinta">{resumen}</p>
          {aproximado && <p className="text-sm text-tinta">Aproximado a cargar: <strong>{aproximado}</strong></p>}
          {(tanques === 'lleno' || mochila === 'llena') && (
            <p className="mt-1 text-xs text-tinta-suave">Lleno va sin tope; si se carga más de lo que le faltaba al camión, queda una alerta.</p>
          )}
        </div>
      )}
      {error && <p className="text-sm text-error">{error}</p>}
      {pie ? (
        pie(datos)
      ) : (
        <button
          type="button"
          className={cn(BOTON_PRIMARIO, 'h-12 w-full justify-center text-base')}
          disabled={crear.isPending || enviando || !listo}
          onClick={async () => {
            setError(null);
            setEnviando(true);
            try {
              const r: ResultadoOrden = generar
                ? await generar(datos)
                : await crear.mutateAsync({
                    camionId: datos.camionId,
                    estacionId: datos.estacionId,
                    modo: 'llenar',
                    litros: null,
                    importe: null,
                    moneda: null,
                    detalle,
                    choferId: datos.choferId,
                    observacion: datos.observacion,
                  });
              if (!r.ok) setError(r.error.mensaje);
              else setCreada(r.data);
            } finally {
              setEnviando(false);
            }
          }}
        >
          <QrCode className="size-5" /> {crear.isPending || enviando ? 'Generando…' : generar ? 'Aprobar y generar la orden' : 'Generar la orden'}
        </button>
      )}
    </div>
  );
}

/** Migración 252 · ¿La orden es para un camión o para un genset? (solo si la base ya lo tiene) */
function TipoOrden({ valor, onCambiar }: { valor: 'camion' | 'genset'; onCambiar: (t: 'camion' | 'genset') => void }) {
  const hay = useBaseTiene(252);
  if (!hay) return null;
  return (
    <section className="space-y-2">
      <p className="text-sm font-semibold text-tinta">¿Para qué es la orden?</p>
      <div className="grid grid-cols-2 gap-2">
        <Opcion activa={valor === 'camion'} onClick={() => onCambiar('camion')} titulo="Camión" detalle="Tanques y mochila" />
        <Opcion activa={valor === 'genset'} onClick={() => onCambiar('genset')} titulo="Genset" detalle="Generador del equipo de frío" />
      </div>
    </section>
  );
}

/** Migración 252 · Orden de carga para un genset: aparte de la del camión, con su palabra y su QR. */
function NuevaOrdenGenset({ onCerrar, onTipo }: { onCerrar: () => void; onTipo: (t: 'camion' | 'genset') => void }) {
  const gensets = useGensetsOrden(true);
  const estaciones = useEstaciones();
  const choferes = useChoferesCombustible();
  const [genset, setGenset] = useState('');
  const [estacion, setEstacion] = useState('');
  const [chofer, setChofer] = useState('');
  const [modo, setModo] = useState<'lleno' | 'litros' | null>(null);
  const [litros, setLitros] = useState('');
  const [obs, setObs] = useState('');
  const [correo, setCorreo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [creada, setCreada] = useState<CreadaOrden | null>(null);
  const prep = usePrepararGenset(genset ? Number(genset) : null, estacion ? Number(estacion) : null);
  const crear = useCrearOrdenGenset();
  const guardarCorreo = useCorreoEstacion();
  const p = prep.data;
  const choferElegido = chofer ? Number(chofer) : (p?.choferId ?? null);
  useAsegurarFotoMail(choferElegido);

  if (creada) return <OrdenCreada creada={creada} onCerrar={onCerrar} />;
  const lit = modo === 'litros' ? aNumero(litros) : null;
  const listo = !!genset && !!estacion && choferElegido !== null && (modo === 'lleno' || (modo === 'litros' && lit !== null));
  const resumen =
    modo === 'lleno'
      ? `Genset: lleno${p?.capacidadL != null ? ` (capacidad ${formatearNumero(p.capacidadL, 0)} L)` : ''}`
      : modo === 'litros'
        ? `Genset: ${litros || '…'} L`
        : null;

  return (
    <div className={cn(TARJETA, 'mb-20 space-y-5 p-4 sm:mb-0')}>
      <div className="flex items-center justify-between">
        <p className="text-lg font-semibold text-tinta">Nueva orden de carga</p>
        <button type="button" aria-label="Cerrar" className="rounded p-1 text-tinta-suave hover:bg-hover" onClick={onCerrar}>
          <X className="size-6" />
        </button>
      </div>

      <TipoOrden valor="genset" onCambiar={onTipo} />

      <Paso numero={1} titulo="Genset y estación">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Genset">
            <select className="h-12 text-base" value={genset} onChange={(e) => setGenset(e.target.value)}>
              <option value="">Elegí…</option>
              {gensets.data?.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.codigo}
                  {g.tractor ? ` · tractor ${g.tractor}` : ''}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Estación de servicio">
            <select className="h-12 text-base" value={estacion} onChange={(e) => setEstacion(e.target.value)}>
              <option value="">Elegí…</option>
              {estaciones.data
                ?.filter((e) => !e.esTanquePropio)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre}
                  </option>
                ))}
            </select>
          </Campo>
        </div>
        {p && (
          <div className="space-y-2 rounded-lg bg-hover p-3 text-sm text-tinta">
            <p>
              {p.tractor ? (
                <>
                  Va en el tractor <strong>{p.tractor}</strong>
                  {p.semi && <> (semi {p.semi})</>}
                </>
              ) : (
                <span className="text-tinta-suave">No se sabe en qué camión está: elegí el chofer que lo lleva.</span>
              )}
            </p>
            <Campo label="Chofer (ve el QR en «Mi viaje»)">
              <select className="h-12 text-base" value={chofer} onChange={(e) => setChofer(e.target.value)}>
                <option value="">{p.chofer ? `${p.chofer} (el que lo lleva)` : 'Elegí…'}</option>
                {choferes.data
                  ?.filter((c) => c.id !== p.choferId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
              </select>
            </Campo>
            {p.vigente && <p className="font-medium text-alerta">Este genset ya tiene la orden {p.vigente} vigente: anulala antes de hacer otra.</p>}
            {estacion && !p.correo && (
              <div className="space-y-2 pt-1">
                <Campo label="Correo de la estación (no tiene)" ayuda="Sin correo no se puede generar la orden. Para varios, separalos con coma.">
                  <input type="email" className="h-12 text-base" value={correo} onChange={(e) => setCorreo(e.target.value)} />
                </Campo>
                <button
                  type="button"
                  className={cn(BOTON_SECUNDARIO, 'w-full justify-center sm:w-auto')}
                  disabled={guardarCorreo.isPending}
                  onClick={async () => {
                    setError(null);
                    const r = await guardarCorreo.mutateAsync({ estacionId: Number(estacion), correo });
                    if (!r.ok) setError(r.error.mensaje);
                    else void prep.refetch();
                  }}
                >
                  <Mail className="size-4" /> Guardar correo
                </button>
              </div>
            )}
          </div>
        )}
      </Paso>

      <Paso numero={2} titulo="Genset">
        <div className="grid grid-cols-2 gap-2">
          <Opcion
            activa={modo === 'lleno'}
            onClick={() => setModo('lleno')}
            titulo="Lleno"
            detalle={p?.capacidadL != null ? `capacidad ${formatearNumero(p.capacidadL, 0)} L` : undefined}
          />
          <Opcion activa={modo === 'litros'} onClick={() => setModo('litros')} titulo="Litros" detalle="Escribís cuántos" />
        </div>
        {modo === 'litros' && <Litros valor={litros} onCambiar={setLitros} etiqueta="Litros para el genset" ejemplo="150" />}
      </Paso>

      <Campo label="Observación (opcional)">
        <input className="h-12 text-base" maxLength={500} value={obs} onChange={(e) => setObs(e.target.value)} />
      </Campo>

      {resumen && (
        <div className="rounded-lg border border-marca/30 bg-marca-suave p-3">
          <p className="text-xs font-medium tracking-wide text-tinta-suave uppercase">Vas a autorizar</p>
          <p className="text-base font-semibold text-tinta">{resumen}</p>
          <p className="mt-1 text-xs text-tinta-suave">Al terminar, el chofer sube el ticket y anota el horómetro: la carga queda registrada sola en el genset.</p>
        </div>
      )}
      {error && <p className="text-sm text-error">{error}</p>}
      <button
        type="button"
        className={cn(BOTON_PRIMARIO, 'h-12 w-full justify-center text-base')}
        disabled={crear.isPending || !listo}
        onClick={async () => {
          setError(null);
          const r = await crear.mutateAsync({
            gensetId: Number(genset),
            estacionId: estacion ? Number(estacion) : null,
            modo: modo ?? 'lleno',
            litros: lit,
            choferId: choferElegido,
            observacion: obs.trim() || null,
          });
          if (!r.ok) setError(r.error.mensaje);
          else setCreada(r.data);
        }}
      >
        <QrCode className="size-5" /> {crear.isPending ? 'Generando…' : 'Generar la orden'}
      </button>
    </div>
  );
}

/** La orden recién creada: la palabra de seguridad se muestra una sola vez. */
function OrdenCreada({ creada, onCerrar }: { creada: CreadaOrden; onCerrar: () => void }) {
  return (
    <div className={cn(TARJETA, 'space-y-3 border-exito/40 p-4')}>
      <p className="flex items-center gap-2 font-semibold text-tinta">
        <BadgeCheck className="size-5 text-exito" /> Orden {creada.numero} creada
      </p>
      <p className="text-sm text-tinta">
        {creada.mail === 'en_cola'
          ? `El mail con la palabra de seguridad sale en un minuto a ${creada.correo}.`
          : creada.mail === 'sin_correo'
            ? 'La estación no tiene correo: mandale la palabra de seguridad por otro medio.'
            : 'El envío de mails todavía no está configurado (Microsoft 365): mandale la palabra a la estación por otro medio. El mail queda en cola y sale cuando se configure.'}{' '}
        El chofer ya tiene su QR en «Mi viaje».
      </p>
      <div className="flex flex-wrap items-center gap-3 rounded-md bg-hover px-3 py-2">
        <KeyRound className="size-5 text-marca" />
        <span className="text-sm text-tinta-suave">Palabra de seguridad (solo para la estación):</span>
        <span className="font-mono text-lg font-bold tracking-wider text-tinta">{creada.palabra}</span>
        <BotonCopiar texto={creada.palabra} />
      </div>
      <p className="text-xs text-tinta-suave">La palabra se muestra solo ahora. No se la pases al chofer.</p>
      <button type="button" className={BOTON_SECUNDARIO} onClick={onCerrar}>
        Listo
      </button>
    </div>
  );
}

/** Un paso del formulario, numerado. */
export function Paso({ numero, titulo, children }: { numero: number; titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <p className="flex items-center gap-2 text-sm font-semibold text-tinta">
        <span className="flex size-6 items-center justify-center rounded-full bg-marca text-xs text-white">{numero}</span>
        {titulo}
      </p>
      {children}
    </section>
  );
}

/** Casillero de litros, grande para el celular. */
export function Litros({ valor, onCambiar, etiqueta, ejemplo }: { valor: string; onCambiar: (v: string) => void; etiqueta: string; ejemplo: string }) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-borde bg-panel px-3">
      <span className="sr-only">{etiqueta}</span>
      <input
        className="h-12 min-w-0 flex-1 border-0 bg-transparent text-lg outline-none"
        inputMode="decimal"
        autoFocus
        value={valor}
        onChange={(e) => onCambiar(e.target.value)}
        placeholder={`Ej. ${ejemplo}`}
      />
      <span className="text-base font-medium text-tinta-suave">litros</span>
    </label>
  );
}

/** Opción grande para tocar con el dedo (título y un detalle chico). */
export function Opcion({
  activa,
  onClick,
  deshabilitada,
  titulo,
  detalle,
}: {
  activa: boolean;
  onClick: () => void;
  deshabilitada?: boolean;
  titulo: string;
  detalle?: string;
}) {
  return (
    <button
      type="button"
      disabled={deshabilitada}
      onClick={onClick}
      aria-pressed={activa}
      className={cn(
        'flex min-h-16 flex-col items-start justify-center rounded-lg border-2 px-3 py-2 text-left disabled:opacity-50',
        activa ? 'border-marca bg-marca-suave' : 'border-borde bg-panel hover:bg-hover',
      )}
    >
      <span className={cn('text-base font-semibold', activa ? 'text-marca' : 'text-tinta')}>{titulo}</span>
      {detalle && <span className="text-xs text-tinta-suave">{detalle}</span>}
    </button>
  );
}

/** Migración 236 · La cuenta que manda los mails (sistemacalderon@hotmail.com): conectarla con Microsoft y probar. */
function CuentaMail() {
  const sp = useSearchParams();
  const vuelta = sp.get('mail');
  const { data, refetch } = useQuery({ queryKey: ['combustible', 'ordenes', 'mail'] as const, queryFn: () => ordenCargaRepository(browserDb()).estadoMail() });
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(
    vuelta ? { ok: vuelta === 'ok', texto: vuelta === 'ok' ? 'Cuenta de mail conectada.' : vuelta } : null,
  );
  const [ocupado, setOcupado] = useState(false);
  if (!data) return null;
  const conectada = data.activo && data.modo === 'cuenta';
  return (
    <div className={cn(TARJETA, 'flex flex-wrap items-center gap-3 px-4 py-3 text-sm')}>
      <Mail className={cn('size-5', data.activo ? 'text-exito' : 'text-alerta')} />
      <span className="flex-1 text-tinta">
        {data.activo
          ? `Los mails salen desde ${data.remitente ?? '—'}${data.pendientes > 0 ? ` · ${data.pendientes} en cola` : ''}.`
          : !data.conClaves
            ? 'Mails sin configurar: falta la cuenta SMTP (servidor, usuario y la contraseña en el Vault) o la aplicación de Microsoft (ver el LEEME).'
            : !data.conHttp
              ? 'Mails sin configurar: falta activar la extensión «http» en Supabase.'
              : 'Falta conectar la cuenta de mail.'}
        {msg && <span className={cn('block text-xs', msg.ok ? 'text-exito' : 'text-error')}>{msg.texto}</span>}
      </span>
      {data.conClaves && data.conHttp && data.modo !== 'smtp' && (
        <button
          type="button"
          className={BOTON_SECUNDARIO}
          disabled={ocupado}
          onClick={async () => {
            setOcupado(true);
            setMsg(null);
            const r = await urlPermisoMail({ volver: `${window.location.origin}/api/mail/microsoft` });
            if (r.ok) window.location.href = r.data;
            else {
              setMsg({ ok: false, texto: r.error.mensaje });
              setOcupado(false);
            }
          }}
        >
          <Link2 className="size-4" /> {conectada ? 'Volver a conectar' : 'Conectar la cuenta de mail'}
        </button>
      )}
      {data.activo && (
        <button
          type="button"
          className={BOTON_SECUNDARIO}
          disabled={ocupado}
          onClick={async () => {
            setOcupado(true);
            const r = await probarMail({});
            setOcupado(false);
            if (!r.ok) setMsg({ ok: false, texto: r.error.mensaje });
            else setMsg(r.data.enviado ? { ok: true, texto: `Mail de prueba enviado a ${r.data.para}.` } : { ok: false, texto: r.data.error ?? 'El mail no salió.' });
            void refetch();
          }}
        >
          <Send className="size-4" /> Probar el envío
        </button>
      )}
    </div>
  );
}

/**
 * Migración 259 · Solicitudes de carga pedidas desde Seguimiento de viaje. Quien tiene «Autoriza cargas» las aprueba
 * (genera la orden y el mail a la estación), las edita antes de aprobarlas o las rechaza con un motivo.
 */
function SolicitudesPendientes({ puede, zona }: { puede: boolean; zona: string }) {
  const hay = useBaseTiene(VERSION_SOLICITUD_CARGA);
  const { data } = useSolicitudesCarga(hay);
  const aprobar = useAprobarSolicitudCarga();
  const [editando, setEditando] = useState<SolicitudCarga | null>(null);
  const [creada, setCreada] = useState<CreadaOrden | null>(null);

  if (creada) return <OrdenCreada creada={creada} onCerrar={() => setCreada(null)} />;
  if (editando)
    return (
      <NuevaOrden
        onCerrar={() => setEditando(null)}
        camionFijo={editando.camionId}
        titulo={`Editar la solicitud de ${editando.patente}`}
        inicial={{ estacionId: editando.estacionId, detalle: editando.detalle, choferId: editando.choferId, observacion: editando.observacion }}
        generar={(d) =>
          aprobar.mutateAsync({
            id: editando.id,
            cambios: { estacionId: d.estacionId, detalle: d.detalle, choferId: d.choferId, observacion: d.observacion },
          })
        }
      />
    );
  if (!data || data.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-tinta">
        Solicitudes de carga pendientes <span className="font-normal text-tinta-suave">({data.length})</span>
      </p>
      {data.map((s) => (
        <TarjetaSolicitud key={s.id} s={s} zona={zona} puede={puede} onEditar={() => setEditando(s)} onAprobada={setCreada} />
      ))}
    </div>
  );
}

function TarjetaSolicitud({
  s,
  zona,
  puede,
  onEditar,
  onAprobada,
}: {
  s: SolicitudCarga;
  zona: string;
  puede: boolean;
  onEditar: () => void;
  onAprobada: (c: CreadaOrden) => void;
}) {
  const aprobar = useAprobarSolicitudCarga();
  const rechazar = useRechazarSolicitudCarga();
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const ocupado = aprobar.isPending || rechazar.isPending;
  return (
    <div className={cn(TARJETA, 'space-y-3 border-alerta/40 p-4')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-base font-semibold text-tinta">
            <span className="font-mono">{s.patente}</span>
            {s.chofer && <span className="font-normal text-tinta-suave"> · {s.chofer}</span>}
          </p>
          <p className="text-xs text-tinta-suave">
            Pidió {s.por ?? '—'} · {formatearFechaHora(s.en, zona)}
            {s.viaje && ` · viaje ${s.viaje}`}
          </p>
        </div>
        <Chip tono="alerta">Pendiente</Chip>
      </div>
      <div className="rounded-lg bg-hover p-3 text-sm text-tinta">
        <p>
          <span className="text-tinta-suave">Estación:</span> <strong>{s.estacion ?? '—'}</strong>
          {!s.correo && <span className="text-alerta"> (sin correo: cargalo al editar)</span>}
        </p>
        <p>
          <span className="text-tinta-suave">A cargar:</span> <strong>{s.aCargar ?? '—'}</strong> · ≈ {formatearNumero(s.litros, 0)} L
        </p>
        {s.observacion && <p className="text-tinta-suave">{s.observacion}</p>}
      </div>
      {error && <p className="text-sm text-error">{error}</p>}
      {puede && !rechazando && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={cn(BOTON_PRIMARIO, 'h-11')}
            disabled={ocupado}
            onClick={async () => {
              setError(null);
              const r = await aprobar.mutateAsync({ id: s.id });
              if (!r.ok) setError(r.error.mensaje);
              else onAprobada(r.data);
            }}
          >
            <Check className="size-4" /> {aprobar.isPending ? 'Generando…' : 'Aprobar'}
          </button>
          <button type="button" className={cn(BOTON_SECUNDARIO, 'h-11')} disabled={ocupado} onClick={onEditar}>
            <Pencil className="size-4" /> Editar
          </button>
          <button type="button" className="h-11 px-3 text-sm text-error hover:underline" disabled={ocupado} onClick={() => setRechazando(true)}>
            Rechazar
          </button>
        </div>
      )}
      {!puede && <p className="text-xs text-tinta-suave">La aprueba quien tiene «Autoriza cargas».</p>}
      {rechazando && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-64 flex-1">
            <Campo label="Motivo del rechazo (le llega a quien la pidió)">
              <input value={motivo} maxLength={500} onChange={(e) => setMotivo(e.target.value)} />
            </Campo>
          </div>
          <button
            type="button"
            className="h-10 rounded-md bg-error px-3 text-sm font-medium text-white disabled:opacity-60"
            disabled={ocupado}
            onClick={async () => {
              setError(null);
              const r = await rechazar.mutateAsync({ id: s.id, motivo });
              if (!r.ok) setError(r.error.mensaje);
              else setRechazando(false);
            }}
          >
            Rechazar la solicitud
          </button>
          <button type="button" className={BOTON_SECUNDARIO} onClick={() => setRechazando(false)}>
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
