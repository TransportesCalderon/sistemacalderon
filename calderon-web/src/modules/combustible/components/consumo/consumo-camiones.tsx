'use client';

import { Truck } from 'lucide-react';
import { TD, TH } from '@/modules/catalogos/components/comun';
import { cn } from '@/shared/lib/cn';
import { formatearNumero } from '@/shared/lib/numeros';
import { useConsumoCamiones } from '../../queries/hooks';
import { Cargando, Encabezado, ErrorLectura, Vacio } from '../comun/ui';
import { Cifra, FiltroPeriodo, usePeriodo } from './periodo';

/**
 * Combustible > Consumo y costo por camión: litros y gasto de las cargas, km y consumo del motor
 * (telemetría), L/100 km, costo por litro y por km. Lo calcula la base (fue.fn_consumo_camiones).
 */
export function ConsumoCamionesPantalla() {
  const [p, setP] = usePeriodo('/combustible/costo-medio');
  const { data, isPending, isError, error, isFetching, refetch } = useConsumoCamiones(p);
  const moneda = data?.find((c) => c.monedaBase)?.monedaBase ?? '';
  const litros = (data ?? []).reduce((a, c) => a + c.litrosCargados, 0);
  const importe = (data ?? []).reduce((a, c) => a + (c.importeBase ?? 0), 0);
  const km = (data ?? []).reduce((a, c) => a + (c.km ?? 0), 0);

  return (
    <div className="space-y-5">
      <Encabezado titulo="Consumo y costo por camión" />
      <FiltroPeriodo p={p} onCambiar={setP} />
      {isPending ? (
        <Cargando texto="Calculando…" />
      ) : isError ? (
        <ErrorLectura texto={error instanceof Error ? error.message : 'No se pudo calcular el consumo.'} onReintentar={() => refetch()} />
      ) : data.length === 0 ? (
        <Vacio icono={<Truck className="size-6" />} texto="No hay cargas ni telemetría en el período." />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Cifra etiqueta="Litros cargados" valor={`${formatearNumero(litros, 0)} L`} />
            <Cifra etiqueta="Gasto" valor={`${formatearNumero(importe, 0)} ${moneda}`} />
            <Cifra etiqueta="Costo medio por litro" valor={litros > 0 ? `${formatearNumero(importe / litros)} ${moneda}` : '—'} />
            <Cifra etiqueta="Km recorridos" valor={formatearNumero(km, 0)} />
          </div>
          <section className="overflow-hidden rounded-xl border border-borde bg-panel">
            <div className="overflow-x-auto">
              <table className={cn('w-full min-w-[1000px] text-sm', isFetching && 'opacity-70')}>
                <thead className="border-b border-borde bg-fondo">
                  <tr>
                    <th className={TH}>Camión</th>
                    <th className={cn(TH, 'text-right')}>Cargas</th>
                    <th className={cn(TH, 'text-right')}>Litros</th>
                    <th className={cn(TH, 'text-right')}>Gasto</th>
                    <th className={cn(TH, 'text-right')}>Por litro</th>
                    <th className={cn(TH, 'text-right')}>Km</th>
                    <th className={cn(TH, 'text-right')}>Motor</th>
                    <th className={cn(TH, 'text-right')}>L/100 km</th>
                    <th className={cn(TH, 'text-right')}>Por km</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borde">
                  {data.map((c) => (
                    <tr key={c.camionId}>
                      <td className={TD}>
                        <span className="font-mono font-medium text-tinta">{c.patente}</span>
                        <span className="block text-xs text-tinta-suave">{c.codigoInterno}</span>
                      </td>
                      <td className={cn(TD, 'text-right tabular-nums')}>{c.cargas}</td>
                      <td className={cn(TD, 'text-right tabular-nums')}>{formatearNumero(c.litrosCargados, 0)}</td>
                      <td className={cn(TD, 'text-right tabular-nums whitespace-nowrap')}>
                        {c.importeBase === null ? '—' : formatearNumero(c.importeBase, 0)}
                      </td>
                      <td className={cn(TD, 'text-right tabular-nums')}>{c.costoLitro === null ? '—' : formatearNumero(c.costoLitro)}</td>
                      <td className={cn(TD, 'text-right tabular-nums')}>
                        {c.km === null ? '—' : formatearNumero(c.km, 0)}
                        {c.fuenteKm === 'cargas' && <span className="block text-xs text-tinta-suave">odómetro de cargas</span>}
                      </td>
                      <td className={cn(TD, 'text-right tabular-nums')}>
                        {c.consumoMotorL === null ? '—' : `${formatearNumero(c.consumoMotorL, 0)} L`}
                      </td>
                      <td className={cn(TD, 'text-right tabular-nums whitespace-nowrap')}>
                        {c.l100Motor === null ? '—' : formatearNumero(c.l100Motor, 1)}
                        {c.l100Cargado !== null && (
                          <span className="block text-xs text-tinta-suave">cargado {formatearNumero(c.l100Cargado, 1)}</span>
                        )}
                      </td>
                      <td className={cn(TD, 'text-right tabular-nums')}>{c.costoKm === null ? '—' : formatearNumero(c.costoKm)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <p className="text-xs text-tinta-suave">
            Montos en {moneda || 'moneda base'}. «Motor» es el consumo que informa la telemetría; «cargado» por 100 km es aproximado, porque
            lo cargado al principio y al final del período no coincide exactamente con lo consumido. Para el control fino, mirá «Cargado vs.
            motor» por viaje.
          </p>
        </>
      )}
    </div>
  );
}
