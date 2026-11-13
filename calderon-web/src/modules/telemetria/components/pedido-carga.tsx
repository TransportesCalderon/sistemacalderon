'use client';

import { useState } from 'react';
import { Fuel, LoaderCircle, MessageCircle, Send } from 'lucide-react';
import { NuevaOrden, Opcion, Paso, type DatosFormularioOrden } from '@/modules/combustible/components/ordenes/ordenes-carga';
import { Cargando, Chip, type Tono } from '@/modules/combustible/components/comun/ui';
import { compararLitros } from '@/modules/combustible/domain/orden-carga.types';
import { useSesion } from '@/modules/core/session/session-provider';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, CONTROL_FILTRO } from '@/shared/ui/clases';
import { ETIQUETA_SOLICITUD, VERSION_SOLICITUD_CARGA, type EstadoSolicitud, type PedidoCarga as Pedido } from '../domain/seguimiento.types';
import { useDatosPedidoCarga, usePedidosCarga, usePedirCarga } from '../queries/hooks';
import { BotonCopiar } from './boton-copiar';
import { Recorrido } from '@/modules/combustible/components/consumo/consumo-rutas';

const decimal = (s: string) => {
  const t = s.trim().replace(/\./g, '').replace(',', '.');
  return t === '' || !Number.isFinite(Number(t)) ? null : Number(t);
};
const texto = (v: number | null, d = 0) => (v === null ? '' : formatearNumero(v, d));
const TONO_SOLICITUD: Record<EstadoSolicitud, Tono> = { pendiente: 'alerta', aprobada: 'exito', rechazada: 'error' };
type Correccion = { km: string; gasto: string; tanques: string; mochila: string; programador: string };
type Resultado = { mensaje: string; pendiente: boolean };

/**
 * Migración 195 · Pedir la carga de combustible de un viaje en curso: la base trae los números
 * (inicial, km, gasto, disponible en tanques y mochila, promedio, programador y litros para llenar).
 * Migración 259 · Se pide con el mismo formulario que «Nueva orden de carga» (camión ya elegido) y al final se
 * elige cómo mandarla: por mensaje (WhatsApp, como antes) o por sistema (solicitud que aprueba quien autoriza cargas).
 */
export function PedidoCarga({ viajeId, camionId, registra, onCerrar }: { viajeId: number; camionId: number; registra: boolean; onCerrar: () => void }) {
  const { zonaHoraria } = useSesion();
  const conSolicitud = useBaseTiene(VERSION_SOLICITUD_CARGA);
  const { data: d, isPending } = useDatosPedidoCarga(viajeId, null);
  const [manual, setManual] = useState(false);
  const [m, setM] = useState<Correccion>({ km: '', gasto: '', tanques: '', mochila: '', programador: '' });
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [form, setForm] = useState(0);
  const { data: pedidos } = usePedidosCarga(viajeId);

  if (isPending || !d) return <Cargando texto="Leyendo los números del viaje…" />;
  const campo = (k: keyof Correccion, etiqueta: string, sugerido: number | null) => (
    <label className="text-xs text-tinta-suave">
      {etiqueta}
      <input
        className={`${CONTROL_FILTRO} mt-0.5 w-full`}
        inputMode="decimal"
        placeholder={sugerido === null ? '' : formatearNumero(sugerido, k === 'programador' ? 1 : 0)}
        value={m[k]}
        onChange={(e) => setM({ ...m, [k]: e.target.value })}
      />
    </label>
  );

  return (
    <div className="space-y-3 rounded-md border border-borde p-3 text-sm">
      <dl className="grid grid-cols-3 gap-2 text-xs sm:grid-cols-6">
        {(
          [
            ['Inicial', d.inicialL, 'L'],
            ['Km', d.km, ''],
            ['Gasto', d.gastoL, 'L'],
            ['Tanques', d.tanquesL, 'L'],
            ['Mochila', d.mochilaL, 'L'],
            ['Promedio', d.l100km, 'L/100'],
          ] as const
        ).map(([e, v, u]) => (
          <div key={e}>
            <dt className="text-tinta-suave">{e}</dt>
            <dd className="font-semibold tabular-nums text-tinta">{v === null ? '—' : `${formatearNumero(v, e === 'Promedio' ? 1 : 0)} ${u}`}</dd>
          </div>
        ))}
      </dl>
      {/* Migración 221: inicial por tanques y mochila, lo cargado en el viaje y la línea por los tramos */}
      <div className="space-y-1 text-xs text-tinta-suave">
        {d.inicialTanquesL !== null && (
          <p>
            Inicial: {formatearNumero(d.inicialTanquesL, 0)} L tanques | {formatearNumero(d.inicialMochilaL ?? 0, 0)} L mochila
            {d.faltanteSalidaL !== null && <span className="text-alerta"> · faltaron {formatearNumero(d.faltanteSalidaL, 0)} L para llenar en la salida</span>}
          </p>
        )}
        <p>
          Cargado en el viaje: <span className="font-semibold text-tinta">{formatearNumero(d.cargasViajeL, 0)} L</span>
          {d.cargasViaje.length > 0 && ` (${d.cargasViaje.map((c) => `${c.estacion}: ${formatearNumero(c.litros, 0)} L`).join(' · ')})`}
        </p>
        {d.linea && (
          <p>
            Línea{d.lineaTramos ? ' (tramos hechos)' : ''}: <span className="text-tinta">{d.linea}</span>
          </p>
        )}
      </div>
      {/* Migración 223: lo necesario para lo que le falta, según el consumo medido en esas rutas */}
      {d.necesario && d.necesario.tramos.length > 0 && (
        <div className="space-y-1 rounded-md bg-hover p-2 text-xs text-tinta-suave">
          <p className="text-tinta">
            Para lo que le falta necesita <strong>{formatearNumero(d.necesario.litros, 0)} L</strong>
            {d.litrosParaLlegar !== null
              ? ` → para llegar con reserva hay que cargar ${formatearNumero(d.litrosParaLlegar, 0)} L`
              : ' (faltan datos de algún tramo: se sugiere llenar)'}
            {d.litrosParaLlenar !== null && ` · para llenar los tanques: ${formatearNumero(d.litrosParaLlenar, 0)} L`}
          </p>
          <Recorrido p={d.necesario} />
        </div>
      )}
      {/* Migración 263: la recomendación con su nombre y de dónde sale; la orden la decide quien autoriza */}
      {d.litrosSugeridos !== null && (
        <p className="text-xs text-tinta-suave">
          <strong className="text-tinta">Recomendación del sistema: cargar ≈ {formatearNumero(d.litrosSugeridos, 0)} L.</strong>{' '}
          {d.litrosParaLlegar !== null && d.litrosParaLlenar !== null
            ? `Es lo menor entre lo que hace falta para llegar con reserva (${formatearNumero(d.litrosParaLlegar, 0)} L) y lo que entra hasta llenar (${formatearNumero(d.litrosParaLlenar, 0)} L).`
            : d.litrosParaLlegar !== null
              ? 'Es lo que hace falta para llegar con reserva.'
              : 'Es lo que entra hasta llenar; faltan datos de la ruta para calcular cuánto necesita.'}{' '}
          Es una recomendación: vos escribís el pedido y quien autoriza decide la orden.
        </p>
      )}
      {d.aviso && <p className="text-xs text-alerta">{d.aviso}</p>}

      {registra && !conSolicitud && <p className="text-xs text-alerta">Falta aplicar en la base el cambio 249 (migración 259) para pedir la carga.</p>}

      {registra && conSolicitud && !resultado && (
        <>
          <label className="inline-flex items-center gap-2 text-xs text-tinta-suave">
            <input type="checkbox" className="accent-marca" checked={manual} onChange={(e) => setManual(e.target.checked)} />
            Corregir con los números de la plataforma de la marca {!d.conTelemetria && '(esta marca no da el consumo por la telemetría)'}
          </label>
          {manual && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {campo('km', 'Km recorridos', d.km)}
              {campo('gasto', 'Gasto (L)', d.gastoL)}
              {campo('tanques', 'Disponible tanques (L)', d.tanquesL)}
              {campo('mochila', 'Disponible mochila (L)', d.mochilaL)}
              {campo('programador', 'Programador (%)', d.programadorPct)}
            </div>
          )}
          <NuevaOrden
            key={form}
            onCerrar={onCerrar}
            camionFijo={camionId}
            titulo="Solicitar carga"
            sinChofer
            pie={(f) => <PieSolicitud f={f} viajeId={viajeId} correccion={manual ? m : null} recomendadoL={d.litrosSugeridos} onListo={setResultado} />}
          />
        </>
      )}

      {resultado && (
        <div className="space-y-2 rounded-md bg-hover p-3">
          {resultado.pendiente ? (
            <p className="text-tinta">
              <strong>Solicitud enviada.</strong> Les llegó el aviso a quienes autorizan cargas. Acá abajo vas a ver si la aprueban (con el número de orden) o
              la rechazan.
            </p>
          ) : (
            <>
              {/* Migración 222: el mensaje trae negritas de WhatsApp (*así*); acá se muestran en negrita y se copian tal cual */}
              <p className="whitespace-pre-line text-tinta">
                {resultado.mensaje.split(/(\*[^*\n]+\*)/g).map((parte, i) =>
                  parte.length > 2 && parte.startsWith('*') && parte.endsWith('*') ? <strong key={i}>{parte.slice(1, -1)}</strong> : parte,
                )}
              </p>
              <BotonCopiar texto={resultado.mensaje} />
            </>
          )}
          <button
            type="button"
            className={cn(BOTON_SECUNDARIO, 'h-9')}
            onClick={() => {
              setResultado(null);
              setForm((x) => x + 1);
            }}
          >
            Hacer otro pedido
          </button>
        </div>
      )}

      {pedidos && pedidos.length > 0 && <Pedidos pedidos={pedidos} zona={zonaHoraria} />}
    </div>
  );
}

/** Migración 259: litros aproximados, precio (para el mensaje) y cómo se manda. */
function PieSolicitud({
  f,
  viajeId,
  correccion,
  recomendadoL,
  onListo,
}: {
  f: DatosFormularioOrden;
  viajeId: number;
  correccion: Correccion | null;
  recomendadoL: number | null;
  onListo: (r: Resultado) => void;
}) {
  const pedir = usePedirCarga();
  const [via, setVia] = useState<'mensaje' | 'sistema' | null>(null);
  const [litros, setLitros] = useState<string | null>(null);
  const [precio, setPrecio] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const litrosTxt = litros ?? texto(f.aproximadoL);
  const precioTxt = precio ?? texto(f.prep?.precio ?? null, 2);
  const listo = f.listo && via !== null && decimal(litrosTxt) !== null;
  const paso = f.detalle?.destino === 'tanques_mochila' ? 5 : 4;
  // Migración 263: cuánto se aparta lo que se pide de lo recomendado
  const frente = compararLitros(decimal(litrosTxt), recomendadoL);

  return (
    <div className="space-y-5">
      <Paso numero={paso} titulo="Litros aproximados">
        <label className="flex items-center gap-2 rounded-lg border border-borde bg-panel px-3">
          <span className="sr-only">Litros aproximados</span>
          <input
            className="h-12 min-w-0 flex-1 border-0 bg-transparent text-lg outline-none"
            inputMode="decimal"
            value={litrosTxt}
            onChange={(e) => setLitros(e.target.value)}
            placeholder={f.aproximadoL === null ? 'Ej. 400' : formatearNumero(f.aproximadoL, 0)}
          />
          <span className="text-base font-medium text-tinta-suave">litros</span>
        </label>
        <p className="text-xs text-tinta-suave">Para el mensaje y el aviso. La estación carga lo que diga la orden.</p>
        {recomendadoL !== null && (
          <p className="text-xs text-tinta-suave">
            El sistema recomienda ≈ {formatearNumero(recomendadoL, 0)} L.
            {frente && (frente.diferencia === 0 ? ' Pedís lo mismo.' : ` Pedís ${frente.texto} que lo recomendado.`)}
          </p>
        )}
      </Paso>

      <Paso numero={paso + 1} titulo="¿Cómo lo mandás?">
        <div className="grid grid-cols-2 gap-2">
          <Opcion activa={via === 'mensaje'} onClick={() => setVia('mensaje')} titulo="Mensaje" detalle="Texto para WhatsApp, como hasta ahora" />
          <Opcion activa={via === 'sistema'} onClick={() => setVia('sistema')} titulo="Por sistema" detalle="Le avisa a quien autoriza cargas" />
        </div>
        {via === 'mensaje' && (
          <label className="block text-xs text-tinta-suave">
            Precio por litro {f.prep?.moneda ? `(${f.prep.moneda})` : ''}
            <input className={`${CONTROL_FILTRO} mt-0.5 w-full`} inputMode="decimal" value={precioTxt} onChange={(e) => setPrecio(e.target.value)} />
            {f.estacionId !== null && f.prep?.precio === null && <span className="block">Sin cargas anteriores en esa estación: escribí el precio</span>}
          </label>
        )}
        {via === 'sistema' && (
          <p className="text-xs text-tinta-suave">
            Queda pendiente arriba de Combustible › Cargas › Órdenes de carga. Al aprobarla se genera la orden y el mail a la estación.
          </p>
        )}
      </Paso>

      {error && <p className="text-sm text-error">{error}</p>}
      <button
        type="button"
        className={cn(BOTON_PRIMARIO, 'h-12 w-full justify-center text-base')}
        disabled={pedir.isPending || !listo}
        onClick={async () => {
          setError(null);
          const r = await pedir.mutateAsync({
            viajeId,
            estacionId: f.estacionId ?? 0,
            litros: decimal(litrosTxt) ?? 0,
            precio: via === 'mensaje' ? decimal(precioTxt) : null,
            km: correccion ? decimal(correccion.km) : null,
            gasto: correccion ? decimal(correccion.gasto) : null,
            tanques: correccion ? decimal(correccion.tanques) : null,
            mochila: correccion ? decimal(correccion.mochila) : null,
            programador: correccion ? decimal(correccion.programador) : null,
            detalle: f.detalle,
            via: via ?? 'mensaje',
            observacion: f.observacion,
          });
          if (!r.ok) setError(r.error.mensaje);
          else onListo(r.data);
        }}
      >
        {pedir.isPending ? (
          <LoaderCircle className="size-5 animate-spin" />
        ) : via === 'sistema' ? (
          <Send className="size-5" />
        ) : via === 'mensaje' ? (
          <MessageCircle className="size-5" />
        ) : (
          <Fuel className="size-5" />
        )}{' '}
        {via === 'sistema' ? 'Enviar la solicitud' : via === 'mensaje' ? 'Armar el mensaje' : 'Elegí cómo mandarlo'}
      </button>
    </div>
  );
}

/** Los pedidos del viaje: por mensaje, o por sistema con su estado (pendiente, aprobada con la orden, rechazada con el motivo). */
function Pedidos({ pedidos, zona }: { pedidos: Pedido[]; zona: string }) {
  const [todos, setTodos] = useState(false);
  const lista = todos ? pedidos : pedidos.slice(0, 3);
  return (
    <div className="space-y-1.5 border-t border-borde pt-2 text-xs text-tinta-suave">
      <p className="font-medium text-tinta">Pedidos de este viaje</p>
      {lista.map((p) => (
        <div key={p.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {p.via === 'sistema' && p.estado ? (
            <Chip tono={TONO_SOLICITUD[p.estado]} title={p.motivoRechazo ?? undefined}>
              {ETIQUETA_SOLICITUD[p.estado]}
            </Chip>
          ) : (
            <Chip tono="neutro">Por mensaje</Chip>
          )}
          <span>
            {formatearFechaHora(p.en, zona)} · {p.por ?? '—'} · {p.aCargar ? `${p.aCargar} · ≈ ` : ''}
            {formatearNumero(p.litros, 0)} L{p.estacion && ` en ${p.estacion}`}
            {p.recomendadoL != null && ` · el sistema recomendaba ≈ ${formatearNumero(p.recomendadoL, 0)} L`}
          </span>
          {p.estado === 'aprobada' && p.orden && (
            <span className="text-exito">
              Orden {p.orden}
              {p.resueltoPor && ` (aprobó ${p.resueltoPor})`}
            </span>
          )}
          {/* Migración 263: lo que decidió la orden, y si es distinto de lo pedido */}
          {p.estado === 'aprobada' && p.ordenACargar && (
            <span className="w-full">
              La orden autoriza: <span className="text-tinta">{p.ordenACargar}</span>
              {p.ordenLitros != null && ` · ≈ ${formatearNumero(p.ordenLitros, 0)} L`}
              {p.ordenConCambios === true ? (
                <span className="text-alerta"> · distinto de lo pedido</span>
              ) : p.ordenConCambios === false ? (
                ' · igual a lo pedido'
              ) : null}
            </span>
          )}
          {p.estado === 'rechazada' && (
            <span className="w-full text-error">
              Rechazada{p.resueltoPor && ` por ${p.resueltoPor}`}: {p.motivoRechazo}
            </span>
          )}
        </div>
      ))}
      {pedidos.length > 3 && (
        <button type="button" className="text-marca hover:underline" onClick={() => setTodos(!todos)}>
          {todos ? 'Ver menos' : `Ver los ${pedidos.length} pedidos`}
        </button>
      )}
    </div>
  );
}
