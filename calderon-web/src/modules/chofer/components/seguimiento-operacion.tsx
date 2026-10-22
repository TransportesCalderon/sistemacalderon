'use client';

import { useState } from 'react';
import { FileUp, MapPin, Smartphone, Truck } from 'lucide-react';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { enlaceMapa, type Posicion } from '../domain/chofer.types';
import { useDocumentosOperacion, useSeguimiento } from '../queries/hooks';
import { ListaDocumentos, SubirDocumento } from './documentos';

function hace(ts: string) {
  const min = Math.round((Date.now() - new Date(ts).getTime()) / 60_000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`;
}

function LineaPosicion({ p }: { p: Posicion }) {
  const { zonaHoraria } = useSesion();
  const Icono = p.fuente === 'telemetria' ? Truck : Smartphone;
  return (
    <a href={enlaceMapa(p.latitud, p.longitud)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-marca hover:underline">
      <Icono className="size-4" />
      {p.fuente === 'telemetria' ? 'Telemetría del tractor' : 'Celular del chofer'} · {hace(p.ts)} ({formatearFechaHora(p.ts, zonaHoraria)})
      {p.velocidadKmh !== null && ` · ${Math.round(p.velocidadKmh)} km/h`}
    </a>
  );
}

/**
 * En la ficha de la operación (Logística): dónde está la carga y los documentos que subió el
 * chofer (o la oficina). La ubicación: la más nueva entre la telemetría del tractor y el celular.
 */
export function SeguimientoOperacion({ servicioId, abierta }: { servicioId: number; abierta: boolean }) {
  const puede = useCan('operacion.servicios:editar');
  const docs = useDocumentosOperacion(servicioId);
  const seg = useSeguimiento(servicioId, abierta);
  const [subir, setSubir] = useState(false);

  return (
    <div className="grid gap-4 border-t border-borde pt-3 lg:grid-cols-2">
      {abierta && (
        <div className="space-y-1 text-sm">
          <h4 className="flex items-center gap-1.5 font-medium text-tinta">
            <MapPin className="size-4" /> Dónde está
          </h4>
          {seg.isLoading ? (
            <p className="text-tinta-suave">Buscando…</p>
          ) : !seg.data?.ultima ? (
            <p className="text-tinta-suave">Sin ubicación: el tractor no tiene telemetría reciente y el chofer no está compartiendo la del celular.</p>
          ) : (
            <>
              <LineaPosicion p={seg.data.ultima} />
              {seg.data.telemetria && seg.data.celular && (
                <p className="text-xs text-tinta-suave">
                  También: <LineaPosicion p={seg.data.ultima.fuente === 'celular' ? seg.data.telemetria : seg.data.celular} />
                </p>
              )}
            </>
          )}
        </div>
      )}
      <div className="space-y-2 text-sm">
        <h4 className="flex items-center gap-1.5 font-medium text-tinta">
          <FileUp className="size-4" /> Documentos ({docs.data?.length ?? 0})
        </h4>
        {docs.data && <ListaDocumentos documentos={docs.data} modo="oficina" puedeQuitar={puede} />}
        {puede &&
          (subir ? (
            <SubirDocumento servicioId={servicioId} modo="oficina" onListo={() => setSubir(false)} />
          ) : (
            <button type="button" className="text-xs text-marca hover:underline" onClick={() => setSubir(true)}>
              Subir un documento
            </button>
          ))}
      </div>
    </div>
  );
}
