'use client';

import { useState } from 'react';
import { Fuel, LoaderCircle } from 'lucide-react';
import { useEnvio } from '@/modules/catalogos/components/comun';
import { useEstaciones } from '@/modules/combustible/queries/hooks';
import { Cargando, ErrorBase } from '@/modules/combustible/components/comun/ui';
import { useSesion } from '@/modules/core/session/session-provider';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { BOTON_PRIMARIO, CONTROL_FILTRO } from '@/shared/ui/clases';
import { useDatosPedidoCarga, usePedidosCarga, usePedirCarga } from '../queries/hooks';
import { BotonCopiar } from './boton-copiar';
import { Recorrido } from '@/modules/combustible/components/consumo/consumo-rutas';

const decimal = (s: string) => {
  const t = s.trim().replace(/\./g, '').replace(',', '.');
  return t === '' || !Number.isFinite(Number(t)) ? null : Number(t);
};
const texto = (v: number | null, d = 0) => (v === null ? '' : formatearNumero(v, d));

/**
 * Migración 195 · Pedir la carga de combustible de un viaje en curso: la base trae los números
 * (inicial, km, gasto, disponible en tanques y mochila, promedio, programador, litros para llenar y el
 * precio de la última carga de la estación), se corrigen si hace falta y se arma el mensaje para Gerencia.
 */
export function PedidoCarga({ viajeId, registra }: { viajeId: number; registra: boolean }) {
  const { zonaHoraria } = useSesion();
  const { data: estaciones } = useEstaciones();
  const [estacion, setEstacion] = useState<number | null>(null);
  const { data: d, isPending } = useDatosPedidoCarga(viajeId, estacion);
  const pedir = usePedirCarga();
  const envio = useEnvio();
  const [litros, setLitros] = useState<string | null>(null);
  const [precio, setPrecio] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [m, setM] = useState({ km: '', gasto: '', tanques: '', mochila: '', programador: '' });
  const [mensaje, setMensaje] = useState<string | null>(null);
  const { data: pedidos } = usePedidosCarga(viajeId);

  if (isPending || !d) return <Cargando texto="Leyendo los números del viaje…" />;
  const litrosTxt = litros ?? texto(d.litrosSugeridos);
  const precioTxt = precio ?? texto(d.precio, 2);
  const campo = (k: keyof typeof m, etiqueta: string, sugerido: number | null) => (
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
      {d.aviso && <p className="text-xs text-alerta">{d.aviso}</p>}

      {registra && (
        <>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="text-xs text-tinta-suave">
              Estación donde carga
              <select className={`${CONTROL_FILTRO} mt-0.5 w-full`} value={estacion ?? ''} onChange={(e) => {
                setEstacion(e.target.value ? Number(e.target.value) : null);
                setPrecio(null);
              }}>
                <option value="">Elegí…</option>
                {estaciones?.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre} ({e.pais})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-tinta-suave">
              Litros a cargar
              <input className={`${CONTROL_FILTRO} mt-0.5 w-full`} inputMode="decimal" value={litrosTxt} onChange={(e) => setLitros(e.target.value)} />
            </label>
            <label className="text-xs text-tinta-suave">
              Precio por litro {d.moneda ? `(${d.moneda})` : ''}
              <input className={`${CONTROL_FILTRO} mt-0.5 w-full`} inputMode="decimal" value={precioTxt} onChange={(e) => setPrecio(e.target.value)} />
              {estacion !== null && (
                <span className="block">
                  {d.precioFecha ? `Última carga ahí: ${formatearFechaHora(d.precioFecha, zonaHoraria)}` : 'Sin cargas anteriores: escribí el precio'}
                </span>
              )}
            </label>
          </div>
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
          <ErrorBase error={envio.error} />
          <button
            type="button"
            className={BOTON_PRIMARIO}
            disabled={pedir.isPending}
            onClick={() =>
              void envio.enviar(
                pedir
                  .mutateAsync({
                    viajeId,
                    estacionId: estacion ?? 0,
                    litros: decimal(litrosTxt) ?? 0,
                    precio: decimal(precioTxt),
                    km: manual ? decimal(m.km) : null,
                    gasto: manual ? decimal(m.gasto) : null,
                    tanques: manual ? decimal(m.tanques) : null,
                    mochila: manual ? decimal(m.mochila) : null,
                    programador: manual ? decimal(m.programador) : null,
                  })
                  .then((r) => {
                    if (r.ok) setMensaje(r.data.mensaje);
                    return r;
                  }),
                () => undefined,
              )
            }
          >
            {pedir.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Fuel className="size-4" />} Armar el pedido
          </button>
        </>
      )}

      {mensaje && (
        <div className="space-y-2 rounded-md bg-hover p-3">
          {/* Migración 222: el mensaje trae negritas de WhatsApp (*así*); acá se muestran en negrita y se copian tal cual */}
          <p className="whitespace-pre-line text-tinta">
            {mensaje.split(/(\*[^*\n]+\*)/g).map((parte, i) =>
              parte.length > 2 && parte.startsWith('*') && parte.endsWith('*') ? <strong key={i}>{parte.slice(1, -1)}</strong> : parte,
            )}
          </p>
          <BotonCopiar texto={mensaje} />
        </div>
      )}
      {pedidos && pedidos.length > 0 && (
        <p className="text-xs text-tinta-suave">
          Último pedido: {formatearFechaHora(pedidos[0]!.en, zonaHoraria)} por {pedidos[0]!.por ?? '—'} · {formatearNumero(pedidos[0]!.litros, 0)} L
          {pedidos[0]!.estacion && ` en ${pedidos[0]!.estacion}`}
          {pedidos.length > 1 && ` · ${pedidos.length} pedidos en este viaje`}
        </p>
      )}
    </div>
  );
}
