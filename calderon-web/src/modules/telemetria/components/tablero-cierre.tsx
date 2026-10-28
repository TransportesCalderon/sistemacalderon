'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Image as ImageIcon } from 'lucide-react';
import { abrirArchivo } from '@/modules/chofer/components/archivos';
import { Seccion } from '@/modules/combustible/components/comun/ui';
import { useSesion } from '@/modules/core/session/session-provider';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { browserDb } from '@/shared/supabase/browser';
import { BOTON_SECUNDARIO } from '@/shared/ui/clases';
import { horasATexto } from '../domain/tablero.types';
import { tableroRepository } from '../repositories/tablero.repository';
import { SubirTablero } from './subir-tablero';
import { invalidar } from '@/shared/query/invalidar';

/**
 * Migración 88: fotos del tablero del camión de este viaje. Sin telemetría del motor, el cierre toma de
 * acá el consumo, los km, las horas y el ralentí (lo decide la base). La oficina puede subirlas si el chofer no lo hizo.
 */
export function TableroCierre({ camionId, desde, hasta, editable }: { camionId: number; desde: string | null; hasta: string | null; editable: boolean }) {
  const { zonaHoraria } = useSesion();
  const qc = useQueryClient();
  const [subir, setSubir] = useState(false);
  const { data } = useQuery({ queryKey: ['tablero', 'camion', camionId], queryFn: () => tableroRepository(browserDb()).lista(camionId, 120) });
  const d0 = desde ? new Date(desde).getTime() : 0;
  const d1 = hasta ? new Date(hasta).getTime() + 24 * 3600 * 1000 : Date.now();
  const delViaje = (data ?? []).filter((t) => {
    const ts = new Date(t.tomadaEn).getTime();
    return ts >= d0 && ts <= d1;
  });
  if (delViaje.length === 0 && !editable) return null;

  return (
    <Seccion
      titulo="Tablero del camión (fotos)"
      acciones={
        editable && !subir ? (
          <button type="button" className={BOTON_SECUNDARIO} onClick={() => setSubir(true)}>
            <Camera className="size-4" /> Subir fotos
          </button>
        ) : undefined
      }
    >
      {delViaje.length === 0 ? (
        <p className="text-sm text-tinta-suave">
          Sin fotos del tablero en este viaje. Si el camión no manda el consumo por internet, el chofer las sube en el llenado de llegada (o subilas acá).
        </p>
      ) : (
        <ul className="divide-y divide-borde text-sm">
          {delViaje.map((t) => (
            <li key={t.id} className="space-y-1 py-2">
              <p className="font-medium text-tinta">
                {formatearFechaHora(t.tomadaEn, zonaHoraria)}
                {t.corregido && <span className="ml-2 text-xs font-normal text-tinta-suave">(corregido a mano)</span>}
              </p>
              <p className="text-tinta-suave">
                {[
                  t.km !== undefined && `${formatearNumero(t.km, 0)} km`,
                  t.litros !== undefined && `${formatearNumero(t.litros, 1)} L`,
                  t.l_100km !== undefined && `${formatearNumero(t.l_100km, 1)} L/100 km`,
                  t.horas !== undefined && `${horasATexto(t.horas)} h de motor`,
                  t.ralenti_h !== undefined && `${horasATexto(t.ralenti_h)} h en ralentí`,
                  t.odometro_km !== undefined && `odómetro ${formatearNumero(t.odometro_km, 0)} km`,
                  t.puntaje !== undefined && `puntuación ${formatearNumero(t.puntaje, 0)} de ${t.puntaje_escala ?? 100}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {t.avisos.length > 0 && <p className="text-xs text-alerta">{t.avisos.join(' · ')}</p>}
              {t.fotos.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {t.fotos.map((f, i) => (
                    <button key={f.ruta} type="button" className="inline-flex items-center gap-1 text-xs text-marca hover:underline" onClick={() => void abrirArchivo(f.ruta)}>
                      <ImageIcon className="size-3.5" /> Foto {i + 1}
                    </button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {editable && subir && (
        <div className="mt-3 max-w-xl">
          <SubirTablero
            camionId={camionId}
            modo="oficina"
            carpeta="oficina/tablero"
            onGuardado={() => {
              setSubir(false);
              void invalidar(qc, 'cierre');
            }}
          />
        </div>
      )}
    </Seccion>
  );
}
