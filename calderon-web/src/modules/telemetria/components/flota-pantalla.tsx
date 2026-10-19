'use client';

import { useState } from 'react';
import Link from 'next/link';
import { LoaderCircle, RadioTower, RefreshCw } from 'lucide-react';
import { TD, TH } from '@/modules/catalogos/components/comun';
import { Cargando, Chip, Encabezado, ErrorBase, ErrorLectura, Seccion, Vacio } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import type { ErrorAccion } from '@/server/actions/result';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { BOTON_SECUNDARIO } from '@/shared/ui/clases';
import { enlaceAlta, haceTexto, minutosDesde, senalDe, type Senal } from '../domain/flota.types';
import { useCorridasApi, useFlotaEnVivo, useImportarAhora, useVehiculosApi } from '../queries/hooks';
import { MapaFlota } from './mapa-flota';

const SENAL: Record<Senal, { texto: string; tono: 'exito' | 'alerta' | 'neutro' }> = {
  vivo: { texto: 'En línea', tono: 'exito' },
  demorada: { texto: 'Demorada', tono: 'alerta' },
  sin_senal: { texto: 'Sin señal', tono: 'neutro' },
};

/** Telemetría > Mapa de flota: última posición, velocidad y combustible de cada camión (cada 10 minutos). */
export function FlotaPantalla() {
  const { zonaHoraria } = useSesion();
  const esTi = useCan('configuracion.catalogos:editar');
  const puedeAltaCamion = useCan('flota.camiones:editar');
  const { data, isPending, isError, refetch } = useFlotaEnVivo();
  const { data: vehiculos } = useVehiculosApi();
  const [elegido, setElegido] = useState<number | null>(null);
  const sinEnlace = (vehiculos ?? []).filter((v) => v.camionId === null);

  return (
    <div className="space-y-5">
      <Encabezado titulo="Mapa de flota" subtitulo="Telemetría">
        {esTi && <ImportarAhora />}
      </Encabezado>

      {sinEnlace.length > 0 && (
        <div className="rounded-lg border border-alerta/30 bg-alerta-suave p-3 text-sm text-alerta">
          <p className="font-medium">
            {sinEnlace.length === 1 ? 'Un camión de la API no está enlazado' : `${sinEnlace.length} camiones de la API no están enlazados`}{' '}
            con un camión del sistema: sus datos no se guardan.
          </p>
          <p className="mt-1">
            Cargá el VIN en{' '}
            <Link href="/flota/camiones" className="font-medium underline">
              Flota &gt; Camiones
            </Link>{' '}
            (o que la patente coincida con el principio del nombre en Optifleet o Volvo Connect). Si el camión todavía no está en el
            sistema, «Dar de alta» abre el formulario con la patente, el VIN, la marca y el modelo:
          </p>
          <ul className="mt-1 list-inside list-disc">
            {sinEnlace.map((v) => (
              <li key={v.vin}>
                <span className="font-mono">{v.vin}</span> · {v.nombre ?? 'sin nombre'}{' '}
                <span className="text-xs capitalize">({v.marca})</span>
                {puedeAltaCamion && (
                  <Link href={enlaceAlta(v)} className="ml-2 font-medium underline">
                    Dar de alta
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {isPending ? (
        <Cargando texto="Cargando la flota…" />
      ) : isError ? (
        <ErrorLectura texto="No se pudo cargar la telemetría." onReintentar={() => refetch()} />
      ) : data.length === 0 ? (
        <Vacio
          icono={<RadioTower className="size-6" />}
          texto="Todavía no llegaron datos de los camiones. La tarea programada los trae cada 10 minutos."
        />
      ) : (
        <>
          <MapaFlota camiones={data} seleccionado={elegido} onSeleccionar={setElegido} />
          <Seccion titulo={`Camiones (${data.length})`}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="border-y border-borde bg-fondo">
                  <tr>
                    <th className={TH}>Camión</th>
                    <th className={TH}>Señal</th>
                    <th className={TH}>Última lectura</th>
                    <th className={cn(TH, 'text-right')}>Velocidad</th>
                    <th className={cn(TH, 'text-right')}>Combustible</th>
                    <th className={cn(TH, 'text-right')}>Odómetro</th>
                    <th className={TH}>Nombre en la API</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borde">
                  {data.map((c) => {
                    const min = minutosDesde(c.ts);
                    const s = SENAL[senalDe(min)];
                    return (
                      <tr
                        key={c.camionId}
                        className={cn('cursor-pointer hover:bg-hover', c.camionId === elegido && 'bg-marca-suave')}
                        onClick={() => setElegido(c.camionId)}
                      >
                        <td className={TD}>
                          <span className="font-mono font-medium text-tinta">{c.patente}</span>
                          <span className="block text-xs text-tinta-suave">{c.codigoInterno}</span>
                        </td>
                        <td className={TD}>
                          <Chip tono={s.tono}>{s.texto}</Chip>
                        </td>
                        <td className={cn(TD, 'tabular-nums')}>
                          {c.ts ? formatearFechaHora(c.ts, zonaHoraria) : '—'}
                          <span className="block text-xs text-tinta-suave">{haceTexto(min)}</span>
                        </td>
                        <td className={cn(TD, 'text-right tabular-nums')}>
                          {c.velocidadKmh === null ? '—' : `${formatearNumero(c.velocidadKmh, 0)} km/h`}
                          {c.motorEncendido === false && <span className="block text-xs text-tinta-suave">motor apagado</span>}
                        </td>
                        <td className={cn(TD, 'text-right tabular-nums')}>
                          {c.nivelPct === null ? '—' : `${formatearNumero(c.nivelPct, 1)} %`}
                          {c.nivelL !== null && <span className="block text-xs text-tinta-suave">≈ {formatearNumero(c.nivelL, 0)} L</span>}
                        </td>
                        <td className={cn(TD, 'text-right tabular-nums')}>
                          {c.odometroKm === null ? '—' : `${formatearNumero(c.odometroKm, 0)} km`}
                        </td>
                        <td className={cn(TD, 'text-xs text-tinta-suave')}>{c.nombreApi ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-tinta-suave">
              El nivel en litros se calcula con la capacidad útil de los tanques del camión (Flota &gt; Camiones &gt; Tanques).
            </p>
          </Seccion>
        </>
      )}

      {esTi && <Corridas zonaHoraria={zonaHoraria} />}
    </div>
  );
}

function ImportarAhora() {
  const importar = useImportarAhora();
  const [error, setError] = useState<ErrorAccion | null>(null);
  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        className={BOTON_SECUNDARIO}
        disabled={importar.isPending}
        onClick={async () => {
          setError(null);
          const r = await importar.mutateAsync({});
          if (!r.ok) setError(r.error);
        }}
      >
        {importar.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Actualizar ahora
      </button>
      <ErrorBase error={error} />
    </div>
  );
}

function Corridas({ zonaHoraria }: { zonaHoraria: string }) {
  const { data } = useCorridasApi(true);
  if (!data || data.length === 0) return null;
  return (
    <Seccion titulo="Últimas importaciones">
      <ul className="divide-y divide-borde text-sm">
        {data.map((c) => (
          <li key={c.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
            <span className="tabular-nums text-tinta-suave">{formatearFechaHora(c.ejecutadoEn, zonaHoraria)}</span>
            <Chip tono={c.ok ? 'exito' : 'error'}>{c.ok ? 'OK' : 'Error'}</Chip>
            <span className="text-xs text-tinta-suave capitalize">{c.marca}</span>
            <span className="text-xs text-tinta-suave">{c.operacion.replace('importacion_', '').replace('prueba_', 'prueba: ')}</span>
            <span className="min-w-0 flex-1 text-tinta">{c.detalle ?? '—'}</span>
          </li>
        ))}
      </ul>
    </Seccion>
  );
}
