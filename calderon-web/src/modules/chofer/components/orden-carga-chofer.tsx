'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { CheckCircle2, CreditCard, Fuel, LoaderCircle, QrCode, Receipt, Trash2, TriangleAlert, X } from 'lucide-react';
import { leerTicketChofer } from '@/modules/combustible/actions/orden-carga.actions';
import {
  urlQr,
  VERSION_CARGA_TARJETA_CHOFER,
  type CargaTarjetaInformada,
  type MiOrden,
  type OpcionesCargaTarjeta,
} from '@/modules/combustible/domain/orden-carga.types';
import { useInformarCargaTarjeta, useMisOrdenesCarga, useNoCargueOrden, useOpcionesCargaTarjeta, useTerminarOrdenCarga } from '@/modules/combustible/queries/orden-carga.hooks';
import { useSesion } from '@/modules/core/session/session-provider';
import { iaRepository } from '@/modules/ia/ia.repository';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { idAleatorio, prepararArchivo, sha256Hex } from '@/shared/lib/archivo';
import { cn } from '@/shared/lib/cn';
import { formatearNumero } from '@/shared/lib/numeros';
import { browserDb } from '@/shared/supabase/browser';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from '@/shared/ui/clases';
import { BUCKET_OPERACION } from '../domain/chofer.types';

const espera = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
async function aBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}
/** Los litros escritos a mano: el punto separa los miles y la coma los decimales (null si no hay un número válido). */
const aLitros = (s: string): number | null => {
  const v = s.trim() === '' ? null : Number(s.replace(/\./g, '').replace(',', '.'));
  return v !== null && Number.isFinite(v) && v > 0 ? v : null;
};

/**
 * Migración 234 · La orden de carga del chofer: «Estás autorizado a cargar combustible» → un QR, sin otros datos.
 * Cuando la estación confirma, «Terminé mi carga» → las fotos de los tickets.
 * Migración 284: en Chile se paga con la tarjeta de flota: no hay QR; la orden ya llega autorizada con lo que se puede cargar.
 * Migración 304: en Chile el chofer avisa la carga con la tarjeta aunque no tenga orden (o se le haya vencido).
 * Cambio 360: la orden de Chile que venció sin ticket se sigue viendo 7 días: «Terminé mi carga» o «No cargué».
 */
export function OrdenCargaChofer() {
  const { data } = useMisOrdenesCarga(true);
  const conTarjeta = useBaseTiene(VERSION_CARGA_TARJETA_CHOFER);
  if (!data) return null;
  // Si tiene una orden de tarjeta abierta, la termina desde la orden («Terminé mi carga»)
  const ordenTarjeta = data.some((o) => o.tarjeta && !o.genset && !o.transferencia);
  // Migración 252: puede haber una del camión y otra del genset al mismo tiempo
  return (
    <>
      {data.map((o) => (o.estado === 'emitida' ? <Autorizado key={o.id} o={o} /> : <Terminar key={o.id} o={o} />))}
      {conTarjeta && !ordenTarjeta && <CargaConTarjeta />}
    </>
  );
}

function Autorizado({ o }: { o: MiOrden }) {
  const [ver, setVer] = useState(false);
  const [img, setImg] = useState<string | null>(null);
  useEffect(() => {
    if (!ver) return;
    void QRCode.toDataURL(urlQr(window.location.origin, o.token), { width: 900, margin: 2, errorCorrectionLevel: 'M' }).then(setImg);
  }, [ver, o.token]);
  return (
    <>
      <div className="space-y-3 rounded-xl border-2 border-marca bg-marca-suave p-4">
        <p className="flex items-center gap-2 text-lg font-semibold text-marca">
          <Fuel className="size-6" /> Estás autorizado a cargar combustible
        </p>
        <p className="text-sm font-medium text-tinta">{o.patente}</p>
        <button type="button" className={`${BOTON_PRIMARIO} w-full justify-center`} onClick={() => setVer(true)}>
          <QrCode className="size-5" /> Mostrar el QR
        </button>
      </div>
      {ver && (
        <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-white p-6" role="dialog" aria-modal="true" aria-label="Código QR de la carga">
          <button type="button" aria-label="Cerrar" className="absolute right-4 top-4 rounded-full p-2 text-black/60 hover:bg-black/5" onClick={() => setVer(false)}>
            <X className="size-7" />
          </button>
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt="Código QR" className="aspect-square w-full max-w-sm" />
          ) : (
            <LoaderCircle className="size-10 animate-spin text-black/40" />
          )}
        </div>
      )}
    </>
  );
}

type Ticket = { clave: string; vista: string; estado: 'subiendo' | 'leyendo' | 'listo' | 'error'; ruta?: string; hash?: string; lectura?: number; litros?: number | null; error?: string };

/** Las fotos de los tickets: se suben, Iris lee los litros de cada una y se suman (Terminé mi carga y la carga con tarjeta). */
function useTickets() {
  const { choferId } = useSesion();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const ocupado = tickets.some((t) => t.estado === 'subiendo' || t.estado === 'leyendo');
  const cambiar = (clave: string, c: Partial<Ticket>) => setTickets((ts) => ts.map((t) => (t.clave === clave ? { ...t, ...c } : t)));

  const procesar = async (archivo: File, clave: string) => {
    try {
      const { blob, extension, tipo } = await prepararArchivo(archivo);
      const hash = await sha256Hex(blob);
      const ruta = `${choferId ?? 0}/tickets/${idAleatorio()}.${extension.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'}`;
      const sub = await browserDb().storage.from(BUCKET_OPERACION).upload(ruta, blob, { contentType: tipo, upsert: false });
      if (sub.error) throw new Error(`No se pudo subir la foto: ${sub.error.message}`);
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(tipo)) {
        cambiar(clave, { estado: 'listo', ruta, hash, litros: null });
        return;
      }
      cambiar(clave, { estado: 'leyendo', ruta, hash });
      const r = await leerTicketChofer({ base64: await aBase64(blob), mediaType: tipo as 'image/jpeg' });
      if (!r.ok) {
        cambiar(clave, { estado: 'listo', litros: null, error: r.error.mensaje });
        return;
      }
      for (let i = 0; i < 50; i++) {
        const res = await iaRepository(browserDb()).resultado(r.data);
        if (res.estado === 'lista') {
          const l = Number((res.propuesta as Record<string, unknown> | null)?.litros);
          cambiar(clave, { estado: 'listo', lectura: r.data, litros: Number.isFinite(l) && l > 0 ? l : null });
          return;
        }
        if (res.estado === 'error') {
          cambiar(clave, { estado: 'listo', litros: null, error: res.error ?? 'Iris no pudo leer el ticket' });
          return;
        }
        await espera(1500);
      }
      cambiar(clave, { estado: 'listo', litros: null });
    } catch (e) {
      cambiar(clave, { estado: 'error', error: e instanceof Error ? e.message : 'No se pudo subir la foto' });
    }
  };

  const agregar = (lista: FileList | null) => {
    if (!lista) return;
    const nuevas: Ticket[] = Array.from(lista)
      .slice(0, 5 - tickets.length)
      .map((a) => ({ clave: idAleatorio(), vista: URL.createObjectURL(a), estado: 'subiendo' }));
    setTickets((ts) => [...ts, ...nuevas]);
    Array.from(lista)
      .slice(0, nuevas.length)
      .forEach((a, i) => void procesar(a, nuevas[i]!.clave));
  };

  const leidos = tickets.filter((t) => t.litros != null).reduce((s, t) => s + (t.litros ?? 0), 0);
  const faltaLeer = tickets.some((t) => t.estado === 'listo' && t.litros == null);
  return {
    tickets,
    ocupado,
    agregar,
    quitar: (clave: string) => setTickets((ts) => ts.filter((x) => x.clave !== clave)),
    leidos,
    faltaLeer,
    /** Iris no leyó algún ticket (o ninguno): hay que escribir el total de litros. */
    pedirLitros: tickets.length > 0 && !ocupado && (faltaLeer || leidos === 0),
    fotos: () => tickets.flatMap((t) => (t.ruta ? [{ ruta: t.ruta, hash: t.hash ?? '' }] : [])),
    lecturas: () => tickets.flatMap((t) => (t.lectura ? [t.lectura] : [])),
  };
}
type Tickets = ReturnType<typeof useTickets>;

/** «Agregar foto de ticket», las fotos con lo que leyó Iris y el total. */
function FotosTickets({ tk }: { tk: Tickets }) {
  return (
    <>
      <label className={`${BOTON_SECUNDARIO} w-full cursor-pointer justify-center`}>
        <Receipt className="size-4" /> Agregar foto de ticket
        <input type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={(e) => tk.agregar(e.target.files)} disabled={tk.tickets.length >= 5} />
      </label>
      {tk.tickets.length > 0 && (
        <ul className="grid grid-cols-3 gap-2">
          {tk.tickets.map((t) => (
            <li key={t.clave} className="relative overflow-hidden rounded-md border border-borde bg-panel">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t.vista} alt="Ticket" className="aspect-[3/4] w-full object-cover" />
              <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-0.5 text-center text-[11px] text-white" title={t.error}>
                {t.estado === 'subiendo' ? 'Subiendo…' : t.estado === 'leyendo' ? 'Iris está leyendo…' : t.estado === 'error' ? 'Error' : t.litros != null ? `${formatearNumero(t.litros, 2)} L` : 'Subido'}
              </span>
              {!tk.ocupado && (
                <button type="button" aria-label="Quitar" className="absolute right-1 top-1 rounded bg-black/50 p-1 text-white" onClick={() => tk.quitar(t.clave)}>
                  <Trash2 className="size-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {tk.tickets.length > 0 && !tk.ocupado && (
        <p className="text-sm text-tinta">
          {tk.leidos > 0 ? `Iris leyó ${formatearNumero(tk.leidos, 2)} L en total.` : 'Iris no leyó los litros.'} {tk.faltaLeer && 'Si falta algún ticket, escribí el total:'}
        </p>
      )}
    </>
  );
}

function Terminar({ o }: { o: MiOrden }) {
  const [abierto, setAbierto] = useState(false);
  const tk = useTickets();
  const [litros, setLitros] = useState('');
  // Migración 252: en la orden de un genset se anota el horómetro
  const [horometro, setHorometro] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<{ litros: number | null } | null>(null);
  const terminar = useTerminarOrdenCarga();
  // Cambio 360: la orden de Chile vencida sin ticket: el chofer avisa que no cargó
  const [noCargue, setNoCargue] = useState<'no' | 'confirmar' | 'hecho'>('no');
  const [errorNoCargue, setErrorNoCargue] = useState<string | null>(null);
  const avisarNoCargue = useNoCargueOrden();

  if (hecho)
    return (
      <div className="flex items-center gap-3 rounded-xl border-2 border-exito bg-exito/10 p-4 text-tinta">
        <CheckCircle2 className="size-6 text-exito" />
        <p className="text-sm">
          Carga terminada{hecho.litros !== null ? `: ${formatearNumero(hecho.litros, 2)} L` : ''}. ¡Gracias!
        </p>
      </div>
    );
  if (noCargue === 'hecho')
    return (
      <div className="flex items-center gap-3 rounded-xl border-2 border-borde bg-panel p-4 text-tinta">
        <CheckCircle2 className="size-6 text-tinta-suave" />
        <p className="text-sm">Listo: avisaste que no cargaste con la orden {o.numero}. Quedó anulada.</p>
      </div>
    );

  return (
    <div className={cn('space-y-3 rounded-xl border-2 p-4', o.vencida ? 'border-alerta bg-alerta-suave' : 'border-exito bg-exito/10')}>
      {o.vencida ? (
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-lg font-semibold text-tinta">
            <TriangleAlert className="size-6 shrink-0 text-alerta" /> Falta el ticket de la carga {o.numero} ({o.patente})
          </p>
          <p className="text-sm text-tinta">
            La orden de <strong>{o.estacion}</strong> ({o.autorizado ?? 'lo autorizado'}) venció. Si cargaste, tocá «Terminé mi carga» y sacale foto al
            ticket. Si no cargaste, tocá «No cargué». Hasta que no lo hagas, no podés pedir dinero.
          </p>
        </div>
      ) : o.tarjeta ? (
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-lg font-semibold text-tinta">
            <CreditCard className="size-6 text-exito" /> Estás autorizado a cargar ({o.patente})
          </p>
          <p className="text-sm text-tinta">
            En <strong>{o.estacion}</strong>: <strong>{o.autorizado ?? 'lo autorizado'}</strong>.{' '}
            {o.transferencia ? <strong>La paga la oficina por transferencia: no uses la tarjeta.</strong> : 'Pagá con la tarjeta de flota.'}
          </p>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-lg font-semibold text-tinta">
          <CheckCircle2 className="size-6 text-exito" /> La estación autorizó tu carga ({o.patente})
        </p>
      )}
      {!abierto ? (
        <>
          <button type="button" className={`${BOTON_PRIMARIO} w-full justify-center`} onClick={() => setAbierto(true)}>
            <Receipt className="size-5" /> Terminé mi carga
          </button>
          {o.vencida &&
            (noCargue === 'confirmar' ? (
              <div className="space-y-2 rounded-lg border border-borde bg-panel p-3">
                <p className="text-sm text-tinta">¿Seguro que no cargaste con la orden {o.numero}? La orden se anula.</p>
                {errorNoCargue && <p className="text-sm text-error">{errorNoCargue}</p>}
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className={`${BOTON_SECUNDARIO} justify-center`} onClick={() => setNoCargue('no')}>
                    Volver
                  </button>
                  <button
                    type="button"
                    className={`${BOTON_PRIMARIO} justify-center`}
                    disabled={avisarNoCargue.isPending}
                    onClick={async () => {
                      setErrorNoCargue(null);
                      const r = await avisarNoCargue.mutateAsync({ id: o.id });
                      if (!r.ok) setErrorNoCargue(r.error.mensaje);
                      else setNoCargue('hecho');
                    }}
                  >
                    {avisarNoCargue.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <X className="size-4" />} No cargué
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className={`${BOTON_SECUNDARIO} w-full justify-center`} onClick={() => setNoCargue('confirmar')}>
                No cargué
              </button>
            ))}
        </>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-tinta">Sacale una foto a cada ticket que te dio la estación (suelen ser 2 o 3).</p>
          <FotosTickets tk={tk} />
          {tk.pedirLitros && (
            <input
              inputMode="decimal"
              className="h-10 w-full rounded-md border border-borde bg-panel px-3 text-sm"
              placeholder="Total de litros, con los decimales del ticket"
              value={litros}
              onChange={(e) => setLitros(e.target.value)}
            />
          )}
          {o.genset && (
            <label className="block space-y-1">
              <span className="text-sm font-medium text-tinta">Horómetro del genset (horas)</span>
              <input
                inputMode="decimal"
                className="h-12 w-full rounded-md border border-borde bg-panel px-3 text-base"
                placeholder="Ej. 1234,5"
                value={horometro}
                onChange={(e) => setHorometro(e.target.value)}
              />
            </label>
          )}
          {error && <p className="text-sm text-error">{error}</p>}
          <button
            type="button"
            className={`${BOTON_PRIMARIO} w-full justify-center`}
            disabled={tk.ocupado || terminar.isPending || (o.genset && horometro.trim() === '')}
            onClick={async () => {
              setError(null);
              const r = await terminar.mutateAsync({
                id: o.id,
                fotos: tk.fotos(),
                lecturas: tk.lecturas(),
                litros: aLitros(litros),
                ...(o.genset ? { horometro: Number(horometro.replace(/\./g, '').replace(',', '.')) } : {}),
              });
              if (!r.ok) setError(r.error.mensaje);
              else setHecho({ litros: (r.data as { litros?: number | null }).litros ?? null });
            }}
          >
            {tk.ocupado ? <LoaderCircle className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Enviar los tickets
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Migración 304 · Chile: se paga con la tarjeta de flota y la estación no autoriza nada (no hay QR). Al terminar de
 * cargar, el chofer elige la estación, dice si llenó el tanque y saca la foto del ticket. La base cierra la orden de
 * tarjeta abierta del camión en esa estación (aunque haya vencido) o crea una ya cargada; la oficina la registra.
 */
function CargaConTarjeta() {
  const { data } = useOpcionesCargaTarjeta(true);
  const [abierto, setAbierto] = useState(false);
  if (!data || data.estaciones.length === 0) return null;
  // Si el camión está parado en una estación de Chile, el botón la nombra
  const cerca = data.estaciones.find((e) => e.id === data.cerca) ?? null;
  if (!abierto)
    return (
      <button
        type="button"
        className={cn(cerca ? BOTON_PRIMARIO : BOTON_SECUNDARIO, 'h-auto min-h-12 w-full justify-center py-2 text-center')}
        onClick={() => setAbierto(true)}
      >
        <CreditCard className="size-5 shrink-0" /> {cerca ? `Cargué en ${cerca.nombre} con la tarjeta` : 'Cargué en Chile con la tarjeta de flota'}
      </button>
    );
  return <FormCargaTarjeta op={data} onCerrar={() => setAbierto(false)} />;
}

function FormCargaTarjeta({ op, onCerrar }: { op: OpcionesCargaTarjeta; onCerrar: () => void }) {
  const [camionId, setCamionId] = useState<number | null>(op.camionId);
  const [estacionId, setEstacionId] = useState<number | null>(op.cerca);
  const [lleno, setLleno] = useState<boolean | null>(null);
  const tk = useTickets();
  const [litros, setLitros] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<CargaTarjetaInformada | null>(null);
  const informar = useInformarCargaTarjeta();
  const campo = 'h-12 w-full rounded-md border border-borde bg-panel px-3 text-base';

  if (hecho)
    return (
      <div className="flex items-center gap-3 rounded-xl border-2 border-exito bg-exito/10 p-4 text-tinta">
        <CheckCircle2 className="size-6 text-exito" />
        <p className="text-sm">
          Listo{hecho.litros !== null ? `: ${formatearNumero(hecho.litros, 2)} L` : ''}. La oficina registra tu carga ({hecho.numero}). ¡Gracias!
        </p>
      </div>
    );

  return (
    <div className="space-y-3 rounded-xl border-2 border-marca bg-panel p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-2 text-lg font-semibold text-tinta">
          <CreditCard className="size-6 text-marca" /> Carga con la tarjeta de flota
        </p>
        <button type="button" aria-label="Cerrar" className="rounded-md p-1 text-tinta-suave hover:bg-hover" onClick={onCerrar}>
          <X className="size-5" />
        </button>
      </div>
      {op.camiones.length === 0 ? (
        <p className="text-sm text-tinta">No tenés un camión a tu nombre en la Pizarra: avisá a la oficina.</p>
      ) : (
        <>
          {op.camiones.length > 1 && (
            <label className="block space-y-1">
              <span className="text-sm font-medium text-tinta">Camión</span>
              <select className={campo} value={camionId ?? ''} onChange={(e) => setCamionId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Elegí el camión</option>
                {op.camiones.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.patente}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block space-y-1">
            <span className="text-sm font-medium text-tinta">¿Dónde cargaste?</span>
            <select className={campo} value={estacionId ?? ''} onChange={(e) => setEstacionId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Elegí la estación</option>
              {op.estaciones.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                  {e.km !== null ? ` · a ${formatearNumero(e.km, 1)} km` : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="space-y-1">
            <p className="text-sm font-medium text-tinta">¿Llenaste el tanque?</p>
            <div className="grid grid-cols-2 gap-2">
              {([true, false] as const).map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  aria-pressed={lleno === v}
                  onClick={() => setLleno(v)}
                  className={cn(
                    'min-h-12 rounded-lg border-2 px-3 text-base font-semibold',
                    lleno === v ? 'border-marca bg-marca-suave text-marca' : 'border-borde bg-panel text-tinta hover:bg-hover',
                  )}
                >
                  {v ? 'Sí, lleno' : 'No'}
                </button>
              ))}
            </div>
          </div>
          <p className="text-sm text-tinta">Sacale una foto a cada ticket.</p>
          <FotosTickets tk={tk} />
          {tk.pedirLitros && (
            <input
              inputMode="decimal"
              className="h-10 w-full rounded-md border border-borde bg-panel px-3 text-sm"
              placeholder="Total de litros, con los decimales del ticket"
              value={litros}
              onChange={(e) => setLitros(e.target.value)}
            />
          )}
          {error && <p className="text-sm text-error">{error}</p>}
          <button
            type="button"
            className={`${BOTON_PRIMARIO} w-full justify-center`}
            disabled={tk.ocupado || informar.isPending}
            onClick={async () => {
              setError(null);
              const r = await informar.mutateAsync({ camionId, estacionId, lleno, fotos: tk.fotos(), lecturas: tk.lecturas(), litros: aLitros(litros) });
              if (!r.ok) setError(r.error.mensaje);
              else setHecho(r.data);
            }}
          >
            {tk.ocupado || informar.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Enviar el ticket
          </button>
        </>
      )}
    </div>
  );
}
