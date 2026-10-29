'use client';

import { Fragment, useState } from 'react';
import { ChevronDown, ChevronUp, Info, LoaderCircle, Lock, Timer, Undo2 } from 'lucide-react';
import { TD, TH } from '@/modules/catalogos/components/comun';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { useCamionesCombustible } from '@/modules/combustible/queries/hooks';
import { useDiasChofer } from '@/modules/telemetria/queries/hooks';
import type { ErrorAccion } from '@/server/actions/result';
import { cn } from '@/shared/lib/cn';
import { formatearFechaDia, hoyEnZona } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { BOTON_PRIMARIO, CONTROL_FILTRO } from '@/shared/ui/clases';
import { mesAnterior, type RalentiChofer } from '../../domain/ralenti.types';
import { useAnularCierreRalenti, useCerrarRalenti, useRalentiMes } from '../../queries/hooks';
import { AccionConMotivo, Cargando, Chip, CLASE_TEXTAREA, Encabezado, ErrorBase, ErrorLectura, Vacio } from '../comun/ui';

const L = (v: number | null, dec = 1) => (v === null ? '—' : `${formatearNumero(v, dec)} L`);
const plata = (moneda: string, v: number | null) => (v === null ? '—' : `${moneda} ${formatearNumero(v, 2)}`);
const finDeMes = (mes: string) => {
  const [a, m] = mes.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
};

/**
 * Combustible > Ralentí del mes (migración 50): litros de ralentí de cada chofer según la
 * telemetría (camión parado con el motor en marcha), el permitido de la empresa y el exceso a
 * descontar. Se cierra por chofer cuando termina el mes. Todo lo calcula la base.
 */
export function RalentiPantalla() {
  const { zonaHoraria } = useSesion();
  const [mes, setMes] = useState(() => mesAnterior(hoyEnZona(zonaHoraria)));
  const { data, isPending, isError, error, isFetching, refetch } = useRalentiMes(mes);
  const [abierto, setAbierto] = useState<number | null>(null);
  const permitido = data?.[0]?.permitidoL;
  const moneda = data?.[0]?.moneda ?? '';
  const porCerrar = (data ?? []).filter((c) => c.choferId !== null && !c.cierre && c.excesoL > 0).length;

  return (
    <div className="space-y-5">
      <Encabezado titulo="Ralentí del mes" />
      <p className="flex max-w-3xl gap-2 text-sm text-tinta-suave">
        <Info className="mt-0.5 size-4 shrink-0" />
        Litros con el camión parado y el motor en marcha, según la telemetría, sumando todos los tractores que manejó cada chofer. Hasta
        {permitido !== undefined ? ` ${formatearNumero(permitido, 0)} L` : ' el permitido'} por mes no se descuenta; el resto sí, al cerrar el mes. El
        permitido y el precio por litro se cambian en Configuración › Parámetros y catálogos.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">
          <span className="block text-xs text-tinta-suave">Mes</span>
          <input
            type="month"
            className={CONTROL_FILTRO}
            value={mes.slice(0, 7)}
            onChange={(e) => {
              if (!e.target.value) return;
              setMes(`${e.target.value}-01`);
              setAbierto(null);
            }}
          />
        </label>
        {porCerrar > 0 && <Chip tono="alerta">{porCerrar} para cerrar</Chip>}
        {isFetching && !isPending && <LoaderCircle className="mb-2 size-4 animate-spin text-tinta-suave" />}
      </div>

      {isPending ? (
        <Cargando texto="Calculando…" />
      ) : isError ? (
        <ErrorLectura texto={error instanceof Error ? error.message : 'No se pudo calcular el ralentí.'} onReintentar={() => refetch()} />
      ) : data.length === 0 ? (
        <Vacio icono={<Timer className="size-6" />} texto="No hay ralentí registrado en el mes." />
      ) : (
        <section className="overflow-hidden rounded-xl border border-borde bg-panel">
          <div className="overflow-x-auto">
            <table className={cn('w-full min-w-[920px] text-sm', isFetching && 'opacity-70')}>
              <thead className="border-b border-borde bg-fondo">
                <tr>
                  <th className={TH}>Chofer</th>
                  <th className={cn(TH, 'text-right')}>Ralentí</th>
                  <th className={cn(TH, 'text-right')}>Exceso</th>
                  <th className={cn(TH, 'text-right')}>Precio por litro</th>
                  <th className={cn(TH, 'text-right')}>A descontar</th>
                  <th className={TH}>Cierre</th>
                  <th className={TH} />
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {data.map((c, i) => {
                  const clave = c.choferId ?? -1 - i;
                  const ab = abierto === clave;
                  return (
                    <Fragment key={clave}>
                      <tr className={cn(c.choferId !== null && 'cursor-pointer hover:bg-hover', ab && 'bg-marca-suave')} onClick={() => c.choferId !== null && setAbierto(ab ? null : clave)}>
                        <td className={TD}>
                          <span className="font-medium text-tinta">{c.chofer ?? 'Sin chofer identificado'}</span>
                          <span className="block text-xs text-tinta-suave">
                            {c.dias} {c.dias === 1 ? 'día' : 'días'}
                            {c.camiones && ` · ${c.camiones}`}
                          </span>
                          {c.diasSinLitros > 0 && <span className="block text-xs text-alerta">{c.diasSinLitros} día(s) con horas pero sin litros</span>}
                        </td>
                        <td className={cn(TD, 'text-right tabular-nums')}>
                          {L(c.ralentiL)}
                          {c.ralentiH !== null && <span className="block text-xs text-tinta-suave">{formatearNumero(c.ralentiH, 1)} h</span>}
                        </td>
                        <td className={cn(TD, 'text-right font-medium tabular-nums', (c.cierre?.excesoL ?? c.excesoL) > 0 ? 'text-error' : 'text-tinta-suave')}>
                          {L(c.cierre ? c.cierre.excesoL : c.excesoL)}
                        </td>
                        <td className={cn(TD, 'text-right tabular-nums')}>{plata(moneda, c.cierre ? c.cierre.precio : c.precioPropuesto)}</td>
                        <td className={cn(TD, 'text-right font-medium tabular-nums')}>{plata(moneda, c.cierre ? c.cierre.importe : c.importe)}</td>
                        <td className={TD}>
                          {c.cierre ? (
                            <span className="inline-flex items-center gap-1 text-xs text-exito">
                              <Lock className="size-3.5" /> {c.cierre.numero}
                            </span>
                          ) : c.choferId === null ? (
                            <span className="text-xs text-tinta-suave">Enlazar la tarjeta o el viaje</span>
                          ) : (
                            <span className="text-xs text-tinta-suave">Sin cerrar</span>
                          )}
                        </td>
                        <td className={cn(TD, 'text-right')}>
                          {c.choferId !== null && (ab ? <ChevronUp className="inline size-4" /> : <ChevronDown className="inline size-4" />)}
                        </td>
                      </tr>
                      {ab && c.choferId !== null && (
                        <tr>
                          <td colSpan={7} className="bg-fondo p-4">
                            <DetalleChofer c={c} mes={mes} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function DetalleChofer({ c, mes }: { c: RalentiChofer; mes: string }) {
  const { data: dias, isPending } = useDiasChofer(c.choferId, mes, finDeMes(mes));
  const { data: camiones } = useCamionesCombustible();
  const puede = useCan('combustible.cierre_viaje:transicionar');
  const anular = useAnularCierreRalenti();
  const [error, setError] = useState<ErrorAccion | null>(null);
  const patente = (id: number) => camiones?.find((x) => x.id === id)?.patente ?? `#${id}`;
  const conRalenti = (dias ?? []).filter((d) => (d.ralentiL ?? 0) > 0 || (d.ralentiH ?? 0) > 0);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div>
        <h3 className="mb-2 text-sm font-medium text-tinta">Día por día</h3>
        {isPending ? (
          <Cargando texto="Cargando…" />
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-borde">
              <tr>
                <th className={TH}>Día</th>
                <th className={TH}>Camión</th>
                <th className={cn(TH, 'text-right')}>Horas</th>
                <th className={cn(TH, 'text-right')}>Litros</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {conRalenti.map((d) => (
                <tr key={`${d.fecha}-${d.camionId}`}>
                  <td className={TD}>{formatearFechaDia(d.fecha)}</td>
                  <td className={cn(TD, 'font-mono')}>{patente(d.camionId)}</td>
                  <td className={cn(TD, 'text-right tabular-nums')}>{d.ralentiH === null ? '—' : formatearNumero(d.ralentiH, 1)}</td>
                  <td className={cn(TD, 'text-right tabular-nums')}>{d.ralentiL === null ? '—' : formatearNumero(d.ralentiL, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div>
        {c.cierre ? (
          <div className="space-y-3 text-sm">
            <h3 className="font-medium text-tinta">Cierre {c.cierre.numero}</h3>
            <p className="text-tinta-suave">
              {L(c.ralentiL)} de ralentí − {L(c.cierre.justificadoL)} justificados − {L(c.permitidoL, 0)} permitidos = <b className="text-tinta">{L(c.cierre.excesoL)}</b>
              {c.cierre.excesoL > 0 && ` × ${plata(c.moneda, c.cierre.precio)} = ${plata(c.moneda, c.cierre.importe)}`}
            </p>
            {puede && (
              <AccionConMotivo
                etiqueta="Anular el cierre"
                icono={<Undo2 className="size-4" />}
                titulo="Anular el cierre del ralentí"
                explicacion="El mes de este chofer vuelve a quedar para cerrar."
                ocupado={anular.isPending}
                error={error}
                onConfirmar={async (motivo) => {
                  setError(null);
                  const r = await anular.mutateAsync({ cierreId: c.cierre!.id, motivo });
                  if (!r.ok) setError(r.error);
                  return r.ok;
                }}
              />
            )}
          </div>
        ) : (
          puede && <CerrarRalenti c={c} mes={mes} />
        )}
      </div>
    </div>
  );
}

function CerrarRalenti({ c, mes }: { c: RalentiChofer; mes: string }) {
  const cerrar = useCerrarRalenti();
  const propuesto = c.precioPropuesto === null ? '' : String(c.precioPropuesto).replace('.', ',');
  const [justificado, setJustificado] = useState('');
  const [motivo, setMotivo] = useState('');
  const [precio, setPrecio] = useState(propuesto);
  const [observacion, setObservacion] = useState('');
  const [error, setError] = useState<ErrorAccion | null>(null);
  const aNumero = (v: string) => {
    const t = v.trim().replace(',', '.');
    return t === '' || !Number.isFinite(Number(t)) ? null : Number(t);
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-tinta">Cerrar el mes de {c.chofer}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="block font-medium text-tinta">Litros justificados</span>
          <input inputMode="decimal" placeholder="0" className={cn(CONTROL_FILTRO, 'h-10 w-full')} value={justificado} onChange={(e) => setJustificado(e.target.value)} />
          <span className="block text-xs text-tinta-suave">Aduana, frío, espera de carga… Se restan antes del permitido.</span>
        </label>
        <label className="space-y-1 text-sm">
          <span className="block font-medium text-tinta">Precio por litro ({c.moneda})</span>
          <input inputMode="decimal" className={cn(CONTROL_FILTRO, 'h-10 w-full')} value={precio} onChange={(e) => setPrecio(e.target.value)} />
          <span className="block text-xs text-tinta-suave">
            {c.precioPromedio === null ? 'Sin cargas con importe en el mes.' : `Promedio del litro en el mes: ${formatearNumero(c.precioPromedio, 2)}.`} Podés sumar el desgaste del camión.
          </span>
        </label>
      </div>
      <label className="block space-y-1 text-sm">
        <span className="block font-medium text-tinta">Motivo de los litros justificados</span>
        <textarea rows={2} maxLength={1000} className={CLASE_TEXTAREA} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="block font-medium text-tinta">Observación</span>
        <textarea rows={2} maxLength={1000} className={CLASE_TEXTAREA} value={observacion} onChange={(e) => setObservacion(e.target.value)} />
      </label>
      <ErrorBase error={error} />
      <button
        type="button"
        className={BOTON_PRIMARIO}
        disabled={cerrar.isPending}
        onClick={async () => {
          setError(null);
          const r = await cerrar.mutateAsync({
            choferId: c.choferId!,
            mes,
            justificadoL: aNumero(justificado) ?? 0,
            motivoJustificado: motivo,
            // Si no se tocó, que la base use su precio propuesto
            precioLitro: precio.trim() === propuesto ? null : aNumero(precio),
            observacion,
          });
          if (!r.ok) setError(r.error);
        }}
      >
        {cerrar.isPending && <LoaderCircle className="size-4 animate-spin" />} Cerrar el mes
      </button>
    </div>
  );
}
