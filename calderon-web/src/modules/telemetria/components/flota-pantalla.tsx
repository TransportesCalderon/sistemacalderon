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
import { enlaceAlta, haceTexto, minutosDesde, senalDe, type CombustibleActual, type Senal } from '../domain/flota.types';
import { useCorridasApi, useFlotaEnVivo, useImportarAhora, useMapaFlota, useVehiculosApi } from '../queries/hooks';
import { MapaFlota } from './mapa-flota';
import { useCelularesEnVivo } from '@/modules/chofer/queries/hooks';

const SENAL: Record<Senal, { texto: string; tono: 'exito' | 'alerta' | 'neutro' }> = {
  vivo: { texto: 'En línea', tono: 'exito' },
  demorada: { texto: 'Demorada', tono: 'alerta' },
  sin_senal: { texto: 'Sin señal', tono: 'neutro' },
};

/** Telemetría > Mapa de flota: última posición, velocidad y combustible de cada camión con la estela de por dónde viene y el chofer. */
export function FlotaPantalla({ enPizarra = false }: { enPizarra?: boolean } = {}) {
  const { zonaHoraria } = useSesion();
  const esTi = useCan('configuracion.catalogos:editar');
  const puedeAltaCamion = useCan('flota.camiones:editar');
  const { data, isPending, isError, refetch } = useFlotaEnVivo();
  const celulares = useCelularesEnVivo();
  const { data: vehiculos } = useVehiculosApi();
  const [elegido, setElegido] = useState<number | null>(null);
  const [minutos, setMinutos] = useState(120);
  const mapa = useMapaFlota(minutos);
  const detalles = mapa.data ?? [];
  const choferDe = new Map(detalles.map((d) => [d.camionId, d.chofer]));
  const combustibleDe = new Map(detalles.map((d) => [d.camionId, d.combustible]));
  const estadoDe = new Map(detalles.map((d) => [d.camionId, d.estadoMotor?.texto ?? null]));
  // Los equipos de Trackerway se enlazan en Configuración › Equipos GPS (migración 72)
  const sinEnlace = (vehiculos ?? []).filter((v) => v.camionId === null && v.marca !== 'trackerway');

  return (
    <div className="space-y-5">
      {/* Sprint 6: dentro de la Pizarra (vista Mapa) el título ya está arriba */}
      {enPizarra ? (
        esTi && (
          <div className="flex justify-end">
            <ImportarAhora />
          </div>
        )
      ) : (
        <Encabezado titulo="Mapa de flota" subtitulo="Telemetría">
          {esTi && <ImportarAhora />}
        </Encabezado>
      )}

      {sinEnlace.length > 0 && (
        <div className="rounded-lg border border-alerta/30 bg-alerta-suave p-3 text-sm text-alerta">
          <p className="font-medium">
            {sinEnlace.length === 1 ? 'Un camión de la API no está enlazado' : `${sinEnlace.length} camiones de la API no están enlazados`}{' '}
            con un camión del sistema: sus datos no se guardan.
          </p>
          <p className="mt-1">
            Cargá el VIN en{' '}
            <Link href="/ajustes/flota" className="font-medium underline">
              Flota › Camiones y equipos
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
      ) : data.length === 0 && (celulares.data?.length ?? 0) === 0 ? (
        <Vacio
          icono={<RadioTower className="size-6" />}
          texto="Todavía no llegaron datos de los camiones. La tarea programada los trae cada 1 o 2 minutos."
        />
      ) : (
        <>
          <MapaFlota
            camiones={data}
            celulares={celulares.data ?? []}
            detalles={detalles}
            minutosEstela={minutos}
            onMinutosEstela={setMinutos}
            zonaHoraria={zonaHoraria}
            seleccionado={elegido}
            onSeleccionar={setElegido}
          />
          {mapa.isError && (
            <p className="rounded-md bg-alerta-suave px-3 py-2 text-sm text-alerta">
              No se pudieron traer el chofer, el combustible y lo del día de los camiones: {mapa.error instanceof Error ? mapa.error.message : 'error de la base'}
            </p>
          )}
          <p className="text-xs text-tinta-suave">
            La línea verde muestra por dónde vino cada camión. Tocá un camión para ver el chofer, la operación y el viaje.
          </p>
          {/* Migración 112: qué quiere decir el color de cada camión */}
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-tinta-suave">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded-full bg-[#16a34a]" /> Motor en marcha
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded-full bg-[#dc2626]" /> Motor apagado
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded-full bg-[#94a3b8]" /> Sin señal del satelital
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-flex size-3.5 items-center justify-center rounded-full bg-[#dc2626] text-[9px] font-extrabold text-white">!</span> Uso abusivo
            </span>
          </p>
          {(celulares.data?.length ?? 0) > 0 && (
            <p className="text-xs text-tinta-suave">Los cuadrados violetas son el celular de los choferes con carga (comparten la ubicación con la aplicación abierta).</p>
          )}
          <Seccion titulo={`Camiones (${data.length})`}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="border-y border-borde bg-fondo">
                  <tr>
                    <th className={TH}>Camión</th>
                    <th className={TH}>Chofer</th>
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
                        <td className={TD}>{choferDe.get(c.camionId) ?? '—'}</td>
                        <td className={TD}>
                          <Chip tono={s.tono}>{s.texto}</Chip>
                        </td>
                        <td className={cn(TD, 'tabular-nums')}>
                          {c.ts ? formatearFechaHora(c.ts, zonaHoraria) : '—'}
                          <span className="block text-xs text-tinta-suave">{haceTexto(min)}</span>
                        </td>
                        <td className={cn(TD, 'text-right tabular-nums')}>
                          {c.velocidadKmh === null ? '—' : `${formatearNumero(c.velocidadKmh, 0)} km/h`}
                          {estadoDe.get(c.camionId) && <span className="block text-xs text-tinta-suave">{estadoDe.get(c.camionId)}</span>}
                        </td>
                        <td className={cn(TD, 'text-right tabular-nums')}>
                          <CeldaCombustible calc={combustibleDe.get(c.camionId) ?? null} sensorPct={c.nivelPct} />
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
              Combustible: lo que debería tener el camión desde el último llenado a tanque lleno, restando lo que quemaron los inyectores (contador del motor) y sumando lo cargado después. Abajo, lo que marca el sensor, que mide solo el tanque principal.
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

/**
 * Migración 94: lo que debería tener el camión (último llenado − lo que quemaron los inyectores + cargas)
 * y, chico, lo que marca el sensor del tanque principal para comparar.
 */
function CeldaCombustible({ calc, sensorPct }: { calc: CombustibleActual | null; sensorPct: number | null }) {
  return (
    <>
      {calc?.litros != null ? (
        <>
          <span className="font-medium text-tinta">≈ {formatearNumero(calc.litros, 0)} L</span>
          {calc.pct != null && <span className="text-tinta-suave"> ({formatearNumero(calc.pct, 0)} %)</span>}
          {calc.mochilaL ? <span className="block text-xs text-tinta-suave">con {formatearNumero(calc.mochilaL, 0)} L de mochila</span> : null}
          {calc.aviso && <span className="block text-xs text-alerta">{calc.aviso}</span>}
        </>
      ) : (
        <span className="text-xs text-tinta-suave" title={calc?.motivo ?? undefined}>
          {calc?.motivo ? 'Sin cálculo' : '—'}
        </span>
      )}
      {sensorPct !== null && <span className="block text-xs text-tinta-suave">sensor principal {formatearNumero(sensorPct, 0)} %</span>}
    </>
  );
}
