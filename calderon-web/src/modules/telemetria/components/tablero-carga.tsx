'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Gauge } from 'lucide-react';
import { Seccion } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { browserDb } from '@/shared/supabase/browser';
import { BOTON_SECUNDARIO } from '@/shared/ui/clases';
import { tableroRepository } from '../repositories/tablero.repository';
import { ConclusionesTablero } from './conclusiones-tablero';
import { SubirTablero } from './subir-tablero';
import { invalidar } from '@/shared/query/invalidar';

/**
 * Migración 224 · En la ficha de un llenado de corte (inicio de viaje): las fotos del tablero, lo que leyó la IA y
 * la interpretación (odómetro contra la telemetría; km, litros y programador del viaje que termina contra lo medido
 * y lo cargado). Desde acá la oficina las puede subir.
 */
export function TableroCarga({ cargaId, camionId }: { cargaId: number; camionId: number }) {
  const { zonaHoraria } = useSesion();
  const puede = useCan('combustible.cargas:editar');
  const qc = useQueryClient();
  const [subir, setSubir] = useState(false);
  const { data } = useQuery({
    queryKey: ['tablero', 'carga', cargaId],
    queryFn: () => tableroRepository(browserDb()).deCarga(cargaId),
  });
  if (!data) return null;
  const refrescar = () => void invalidar(qc, 'tablero');

  return (
    <Seccion
      titulo="Tablero del camión (inicio de viaje)"
      acciones={
        puede && !subir ? (
          <button type="button" className={BOTON_SECUNDARIO} onClick={() => setSubir(true)}>
            <Camera className="size-4" /> Subir fotos
          </button>
        ) : undefined
      }
    >
      {data.tableros.length === 0 ? (
        <p className="text-sm text-tinta-suave">Todavía no hay fotos del tablero de este llenado.</p>
      ) : (
        <ul className="divide-y divide-borde">
          {data.tableros.map((t) => (
            <li key={t.id} className="space-y-2 py-3">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-tinta">
                <Gauge className="size-4 text-marca" /> {formatearFechaHora(t.tomadaEn, zonaHoraria)}
                <span className="font-normal text-tinta-suave">
                  {[
                    t.odometro_km !== undefined && `odómetro ${formatearNumero(t.odometro_km, 0)} km`,
                    t.km !== undefined && `${formatearNumero(t.km, 0)} km`,
                    t.litros !== undefined && `${formatearNumero(t.litros, 1)} L`,
                    t.l_100km !== undefined && `${formatearNumero(t.l_100km, 1)} L/100 km`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </p>
              {t.interpretacion && <ConclusionesTablero i={t.interpretacion} />}
            </li>
          ))}
        </ul>
      )}
      {data.odometroCarga === null && data.odometroFoto !== null && (
        <p className="text-xs text-tinta-suave">La carga no tiene odómetro: el cierre del viaje usa el de la foto ({formatearNumero(data.odometroFoto, 0)} km).</p>
      )}
      {subir && (
        <SubirTablero
          camionId={camionId}
          modo="oficina"
          carpeta={`oficina/tablero/${cargaId}`}
          cargaId={cargaId}
          onGuardado={() => {
            refrescar();
          }}
        />
      )}
    </Seccion>
  );
}
