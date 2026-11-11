'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, Fuel, KeyRound, Link2, Mail, QrCode, Send, TriangleAlert, X } from 'lucide-react';
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
import { ETIQUETA_ESTADO_ORDEN, VERSION_ORDEN_CARGA, type CreadaOrden, type DetalleOrden, type EstadoOrden, type OrdenCarga } from '../../domain/orden-carga.types';
import { useCamionesCombustible, useChoferesCombustible, useEstaciones } from '../../queries/hooks';
import { useAnularOrdenCarga, useCorreoEstacion, useCrearOrdenCarga, useOrdenesCarga, usePrepararOrden, useRevisarOrdenCarga } from '../../queries/orden-carga.hooks';

const TONO: Record<EstadoOrden, Tono> = { emitida: 'marca', autorizada: 'alerta', cargada: 'exito', anulada: 'neutro', bloqueada: 'error', vencida: 'neutro' };
const TH = 'px-3 py-2.5 whitespace-nowrap';
const TD = 'px-3 py-2.5 align-top';
const aNumero = (s: string) => (s.trim() === '' ? null : Number(s.replace(/\./g, '').replace(',', '.')));

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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-tinta-suave">
          La estación recibe un mail con la palabra de seguridad; el chofer, un QR. El playero escanea el QR, escribe la palabra y confirma la carga.
        </p>
        {puede && !nueva && (
          <button type="button" className={BOTON_PRIMARIO} onClick={() => setNueva(true)}>
            <Fuel className="size-4" /> Nueva orden de carga
          </button>
        )}
      </div>
      {configuraMail && <CuentaMail />}
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
          {o.estado === 'emitida' && <span className="block text-xs text-tinta-suave">vence {formatearFechaHora(o.venceEn, zona)}</span>}
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

function NuevaOrden({ onCerrar }: { onCerrar: () => void }) {
  const camiones = useCamionesCombustible();
  const estaciones = useEstaciones();
  const [camion, setCamion] = useState('');
  const [estacion, setEstacion] = useState('');
  // Migración 248: 1) solo tanques o tanques y mochila; 2) cada uno lleno o con litros
  const [destino, setDestino] = useState<DetalleOrden['destino'] | null>(null);
  const [tanques, setTanques] = useState<'lleno' | 'litros' | null>(null);
  const [litrosTanques, setLitrosTanques] = useState('');
  const [mochila, setMochila] = useState<'llena' | 'litros' | null>(null);
  const [litrosMochila, setLitrosMochila] = useState('');
  const [obs, setObs] = useState('');
  // Otro chofer que el de la Pizarra (vacío = el de la Pizarra): es quien ve el QR en «Mi viaje»
  const [chofer, setChofer] = useState('');
  const choferes = useChoferesCombustible();
  const [correo, setCorreo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [creada, setCreada] = useState<CreadaOrden | null>(null);
  const prep = usePrepararOrden(camion ? Number(camion) : null, estacion ? Number(estacion) : null);
  const crear = useCrearOrdenCarga();
  const guardarCorreo = useCorreoEstacion();
  const p = prep.data;
  // Migración 246: que la foto del chofer salga en el mail aunque se haya cargado antes del cambio 232
  useAsegurarFotoMail(chofer ? Number(chofer) : (p?.choferId ?? null));

  if (creada)
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

  return (
    <div className={cn(TARJETA, 'space-y-4 p-4')}>
      <div className="flex items-center justify-between">
        <p className="font-semibold text-tinta">Nueva orden de carga</p>
        <button type="button" aria-label="Cerrar" className="rounded p-1 text-tinta-suave hover:bg-hover" onClick={onCerrar}>
          <X className="size-5" />
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo label="Camión">
          <select value={camion} onChange={(e) => setCamion(e.target.value)}>
            <option value="">Elegí…</option>
            {camiones.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.patente}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Estación de servicio">
          <select value={estacion} onChange={(e) => setEstacion(e.target.value)}>
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
        <div className="space-y-1 rounded-md bg-hover px-3 py-2 text-sm text-tinta">
          <div className="max-w-sm">
            <Campo label="Chofer (ve el QR en «Mi viaje»)">
              <select value={chofer} onChange={(e) => setChofer(e.target.value)}>
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
          </div>
          <p>
            {p.litrosParaLlenar !== null ? (
              <>
                Para llenar le faltan <strong>{formatearNumero(p.litrosParaLlenar, 0)} L</strong> (tiene ≈ {formatearNumero(p.litrosActuales ?? 0, 0)} de{' '}
                {formatearNumero(p.capacidadL ?? 0, 0)} L)
              </>
            ) : (
              <span className="text-tinta-suave">No se puede calcular cuánto le falta para llenar{p.motivoSinCalculo ? `: ${p.motivoSinCalculo}` : ''}.</span>
            )}
          </p>
          {p.precio !== null && (
            <p className="text-tinta-suave">
              Último precio en la estación: {p.moneda} {formatearNumero(p.precio, 2)} por litro
            </p>
          )}
          {p.vigente && <p className="text-alerta">Este camión ya tiene la orden {p.vigente} vigente: anulala antes de hacer otra.</p>}
          {estacion && !p.correo && (
            <div className="flex flex-wrap items-end gap-2 pt-1">
              <div className="min-w-64 flex-1">
                <Campo label="Correo de la estación (no tiene)" ayuda="Para varios, separalos con coma.">
                  <input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} />
                </Campo>
              </div>
              <button
                type="button"
                className={BOTON_SECUNDARIO}
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
          {!p.mail.activo && <p className="text-xs text-tinta-suave">El envío de mails todavía no está configurado: la palabra se te muestra para mandarla a mano.</p>}
        </div>
      )}
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-tinta">¿Qué se carga?</legend>
        <div className="flex flex-wrap gap-2">
          <Opcion activa={destino === 'tanques'} onClick={() => setDestino('tanques')}>
            Solo los tanques
          </Opcion>
          <Opcion activa={destino === 'tanques_mochila'} onClick={() => setDestino('tanques_mochila')} deshabilitada={p ? p.capacidadMochilaL === null : false}>
            Los tanques y la mochila
          </Opcion>
        </div>
        {p && p.capacidadMochilaL === null && (
          <p className="text-xs text-tinta-suave">Este camión no tiene la mochila cargada en Flota › Camiones › Tanques.</p>
        )}
        {destino && (
          <div className="space-y-2 rounded-md border border-borde p-3">
            <p className="text-sm font-medium text-tinta">Tanques</p>
            <div className="flex flex-wrap items-center gap-2">
              <Opcion activa={tanques === 'lleno'} onClick={() => setTanques('lleno')}>
                Tanques llenos{p?.litrosParaLlenar != null && destino === 'tanques' ? ` (≈ ${formatearNumero(p.litrosParaLlenar, 0)} L)` : ''}
              </Opcion>
              <Opcion activa={tanques === 'litros'} onClick={() => setTanques('litros')}>
                Una cantidad de litros
              </Opcion>
              {tanques === 'litros' && (
                <input
                  className="h-9 w-32 rounded-md border border-borde px-2"
                  inputMode="decimal"
                  aria-label="Litros para los tanques"
                  value={litrosTanques}
                  onChange={(e) => setLitrosTanques(e.target.value)}
                  placeholder="Ej. 100"
                />
              )}
            </div>
          </div>
        )}
        {destino === 'tanques_mochila' && (
          <div className="space-y-2 rounded-md border border-borde p-3">
            <p className="text-sm font-medium text-tinta">Mochila</p>
            <div className="flex flex-wrap items-center gap-2">
              <Opcion activa={mochila === 'llena'} onClick={() => setMochila('llena')}>
                Mochila llena{p?.capacidadMochilaL != null ? ` (${formatearNumero(p.capacidadMochilaL, 0)} L)` : ''}
              </Opcion>
              <Opcion activa={mochila === 'litros'} onClick={() => setMochila('litros')}>
                Una cantidad de litros
              </Opcion>
              {mochila === 'litros' && (
                <input
                  className="h-9 w-32 rounded-md border border-borde px-2"
                  inputMode="decimal"
                  aria-label="Litros para la mochila"
                  value={litrosMochila}
                  onChange={(e) => setLitrosMochila(e.target.value)}
                  placeholder="Ej. 300"
                />
              )}
            </div>
          </div>
        )}
        {(tanques === 'lleno' || mochila === 'llena') && (
          <p className="text-xs text-tinta-suave">
            Lleno se autoriza sin tope. Si al final se carga más de lo que le faltaba al camión, queda una alerta (posible faltante de combustible en el viaje).
          </p>
        )}
      </fieldset>
      <Campo label="Observación (opcional)">
        <input maxLength={500} value={obs} onChange={(e) => setObs(e.target.value)} />
      </Campo>
      {error && <p className="text-sm text-error">{error}</p>}
      <button
        type="button"
        className={BOTON_PRIMARIO}
        disabled={crear.isPending || !destino || !tanques || (destino === 'tanques_mochila' && !mochila)}
        onClick={async () => {
          setError(null);
          const r = await crear.mutateAsync({
            camionId: camion ? Number(camion) : null,
            estacionId: estacion ? Number(estacion) : null,
            modo: 'llenar',
            litros: null,
            importe: null,
            moneda: null,
            detalle: destino
              ? {
                  destino,
                  tanques: { modo: tanques ?? 'lleno', litros: tanques === 'litros' ? aNumero(litrosTanques) : null },
                  ...(destino === 'tanques_mochila'
                    ? { mochila: { modo: mochila ?? 'llena', litros: mochila === 'litros' ? aNumero(litrosMochila) : null } }
                    : {}),
                }
              : null,
            choferId: chofer ? Number(chofer) : (p?.choferId ?? null),
            observacion: obs.trim() || null,
          });
          if (!r.ok) setError(r.error.mensaje);
          else setCreada(r.data);
        }}
      >
        <QrCode className="size-4" /> Generar la orden
      </button>
    </div>
  );
}

/** Botón de elección (pastilla). */
function Opcion({ activa, onClick, deshabilitada, children }: { activa: boolean; onClick: () => void; deshabilitada?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled={deshabilitada}
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1.5 text-sm disabled:opacity-50',
        activa ? 'border-marca bg-marca-suave text-marca' : 'border-borde text-tinta hover:bg-hover',
      )}
    >
      {children}
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
