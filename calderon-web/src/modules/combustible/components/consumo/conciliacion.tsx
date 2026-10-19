'use client';

import { Gauge } from 'lucide-react';
import { TD, TH } from '@/modules/catalogos/components/comun';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { fueraDeTolerancia, type ViajeConciliado } from '../../domain/consumo.types';
import { ETIQUETA_SITUACION_VIAJE } from '../../domain/viaje.types';
import { useConciliacionViajes } from '../../queries/hooks';
import { Cargando, Chip, Encabezado, ErrorLectura, Vacio } from '../comun/ui';
import { AccionViaje } from '../viajes/viajes-lista';
import { Cifra, FiltroPeriodo, usePeriodo } from './periodo';

const suma = (l: (number | null)[]) => l.reduce<number>((a, b) => a + (b ?? 0), 0);

/**
 * Combustible > Cargado vs. motor: cada viaje terminado con lo que se le cargó al camión y lo que
 * consumió el motor según la telemetría. Positivo = falta combustible. Ordenado por llegada.
 */
export function ConciliacionPantalla() {
  const { zonaHoraria } = useSesion();
  const [p, setP] = usePeriodo('/combustible/conciliacion');
  const { data, isPending, isError, error, isFetching, refetch } = useConciliacionViajes(p);
  const conDatos = (data ?? []).filter((v) => v.diferenciaL !== null);
  const fuera = conDatos.filter(fueraDeTolerancia);
  const totalDif = suma(conDatos.map((v) => v.diferenciaL));

  return (
    <div className="space-y-5">
      <Encabezado titulo="Cargado vs. motor" />
      <p className="text-sm text-tinta-suave">
        Por viaje (de un tanque lleno al siguiente): lo cargado frente a lo que consumió el motor según la telemetría. Una diferencia
        positiva es combustible que falta. Los cierres aprobados muestran lo aprobado; el resto se calcula en el momento.
      </p>
      <FiltroPeriodo p={p} onCambiar={setP} conCamion />

      {isPending ? (
        <Cargando texto="Calculando los viajes…" />
      ) : isError ? (
        <ErrorLectura
          texto={error instanceof Error ? error.message : 'No se pudieron calcular los viajes.'}
          onReintentar={() => refetch()}
        />
      ) : data.length === 0 ? (
        <Vacio icono={<Gauge className="size-6" />} texto="No hay viajes terminados en el período." />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Cifra etiqueta="Viajes" valor={String(data.length)} detalle={`${data.length - conDatos.length} sin consumo de telemetría`} />
            <Cifra etiqueta="Cargado" valor={`${formatearNumero(suma(conDatos.map((v) => v.cargadoL)), 0)} L`} />
            <Cifra etiqueta="Consumo del motor" valor={`${formatearNumero(suma(conDatos.map((v) => v.consumoMotorL)), 0)} L`} />
            <Cifra
              etiqueta={totalDif >= 0 ? 'Falta en total' : 'Sobra en total'}
              valor={`${formatearNumero(Math.abs(totalDif), 0)} L`}
              detalle={`${fuera.length} viaje(s) fuera de tolerancia`}
              alerta={fuera.length > 0}
            />
          </div>

          <section className="overflow-hidden rounded-xl border border-borde bg-panel">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] text-sm">
                <thead className="border-b border-borde bg-fondo">
                  <tr>
                    <th className={TH}>Camión</th>
                    <th className={TH}>Viaje</th>
                    <th className={cn(TH, 'text-right')}>Cargado</th>
                    <th className={cn(TH, 'text-right')}>Motor</th>
                    <th className={cn(TH, 'text-right')}>Diferencia</th>
                    <th className={cn(TH, 'text-right')}>Km</th>
                    <th className={cn(TH, 'text-right')}>L/100 km</th>
                    <th className={TH}>Cierre</th>
                  </tr>
                </thead>
                <tbody className={cn('divide-y divide-borde', isFetching && 'opacity-70')}>
                  {data.map((v) => (
                    <Fila key={`${v.camionId}-${v.cargaSalidaId}`} v={v} zonaHoraria={zonaHoraria} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Fila({ v, zonaHoraria }: { v: ViajeConciliado; zonaHoraria: string }) {
  const fuera = fueraDeTolerancia(v);
  return (
    <tr className={cn(fuera && 'bg-alerta-suave/40')}>
      <td className={cn(TD, 'font-mono font-medium')}>{v.patente}</td>
      <td className={cn(TD, 'whitespace-nowrap tabular-nums')}>
        {formatearFechaHora(v.salidaTs, zonaHoraria)}
        <span className="block text-xs text-tinta-suave">→ {formatearFechaHora(v.llegadaTs, zonaHoraria)}</span>
      </td>
      <td className={cn(TD, 'text-right tabular-nums')}>{v.cargadoL === null ? '—' : `${formatearNumero(v.cargadoL)} L`}</td>
      <td className={cn(TD, 'text-right tabular-nums')}>
        {v.consumoMotorL === null ? <span className="text-tinta-suave">sin dato</span> : `${formatearNumero(v.consumoMotorL)} L`}
        {v.fuenteConsumo && v.fuenteConsumo !== 'telemetria' && (
          <span className="block text-xs text-tinta-suave">{v.fuenteConsumo.replace('_', ' ')}</span>
        )}
      </td>
      <td className={cn(TD, 'text-right')}>
        {v.diferenciaL === null ? (
          <span className="text-tinta-suave">—</span>
        ) : (
          <span className={cn('font-semibold whitespace-nowrap tabular-nums', fuera ? 'text-alerta' : 'text-tinta')}>
            {v.diferenciaL > 0 ? 'Faltan' : v.diferenciaL < 0 ? 'Sobran' : ''} {formatearNumero(Math.abs(v.diferenciaL))} L
          </span>
        )}
        {v.toleranciaL !== null && <span className="block text-xs text-tinta-suave">± {formatearNumero(v.toleranciaL, 0)} L</span>}
      </td>
      <td className={cn(TD, 'text-right tabular-nums')}>
        {v.km === null ? '—' : formatearNumero(v.km, 0)}
        {v.fuenteKm && v.fuenteKm !== 'telemetria' && <span className="block text-xs text-tinta-suave">{v.fuenteKm}</span>}
      </td>
      <td className={cn(TD, 'text-right tabular-nums whitespace-nowrap')}>
        {v.l100Motor === null ? '—' : formatearNumero(v.l100Motor, 1)}
        {v.l100Cargado !== null && <span className="block text-xs text-tinta-suave">cargado {formatearNumero(v.l100Cargado, 1)}</span>}
      </td>
      <td className={TD}>
        <div className="flex flex-col items-start gap-1">
          <Chip tono={v.situacion === 'aprobado' ? 'exito' : v.situacion === 'borrador' ? 'marca' : 'alerta'}>
            {ETIQUETA_SITUACION_VIAJE[v.situacion]}
          </Chip>
          <AccionViaje viaje={v} />
        </div>
      </td>
    </tr>
  );
}
