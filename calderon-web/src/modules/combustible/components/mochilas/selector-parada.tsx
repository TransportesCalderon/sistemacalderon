'use client';

import { useState, type ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';
import { useSesion } from '@/modules/core/session/session-provider';
import type { ErrorAccion } from '@/server/actions/result';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, CONTROL_FILTRO } from '@/shared/ui/clases';
import { useParadas } from '../../queries/hooks';
import { ErrorBase } from '../comun/ui';

/** Opciones de paradas del camión, para usar dentro de un <select> registrado en un formulario. */
export function OpcionesParada({ camionId, soloFronteras = true, vacio = 'Elegí la parada frontera…' }: { camionId: number; soloFronteras?: boolean; vacio?: string }) {
  const { zonaHoraria } = useSesion();
  const { data, isPending } = useParadas(camionId, soloFronteras);
  return (
    <>
      <option value="">{isPending ? 'Cargando paradas…' : vacio}</option>
      {data?.map((p) => (
        <option key={p.id} value={p.id}>
          #{p.id} · {formatearFechaHora(p.fechaHora, zonaHoraria)} · {formatearNumero(p.litros)} L{p.estacion ? ` · ${p.estacion}` : ''}
        </option>
      ))}
    </>
  );
}

/** Select de paradas del camión (por defecto solo fronteras), con la estación y los litros. */
export function SelectorParada({
  camionId,
  value,
  onChange,
  soloFronteras = true,
  vacio = 'Elegí la parada frontera…',
  className,
  id,
}: {
  camionId: number;
  value: string;
  onChange: (v: string) => void;
  soloFronteras?: boolean;
  vacio?: string;
  className?: string;
  id?: string;
}) {
  const { zonaHoraria } = useSesion();
  const { data, isPending } = useParadas(camionId, soloFronteras);
  return (
    <select id={id} className={className ?? CONTROL_FILTRO} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{isPending ? 'Cargando paradas…' : vacio}</option>
      {data?.map((p) => (
        <option key={p.id} value={p.id}>
          #{p.id} · {formatearFechaHora(p.fechaHora, zonaHoraria)} · {formatearNumero(p.litros)} L{p.estacion ? ` · ${p.estacion}` : ''}
        </option>
      ))}
    </select>
  );
}

/**
 * Botón que abre un panel para elegir una parada frontera y confirmar (registrar o cerrar un
 * uso de mochila, cerrar la vigencia de una mochila). El error es el de la base.
 */
export function AccionConParada({
  camionId,
  etiqueta,
  icono,
  titulo,
  explicacion,
  ocupado,
  onConfirmar,
}: {
  camionId: number;
  etiqueta: string;
  icono?: ReactNode;
  titulo: string;
  explicacion?: string;
  ocupado: boolean;
  onConfirmar: (paradaId: number) => Promise<ErrorAccion | null>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [parada, setParada] = useState('');
  const [error, setError] = useState<ErrorAccion | null>(null);
  if (!abierto) {
    return (
      <button type="button" className={BOTON_SECUNDARIO} onClick={() => setAbierto(true)}>
        {icono} {etiqueta}
      </button>
    );
  }
  return (
    <div className="w-full space-y-3 rounded-lg border border-borde p-4">
      <h3 className="font-medium text-tinta">{titulo}</h3>
      {explicacion && <p className="text-sm text-tinta-suave">{explicacion}</p>}
      <SelectorParada camionId={camionId} value={parada} onChange={setParada} className={`${CONTROL_FILTRO} w-full`} />
      <ErrorBase error={error} />
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className={BOTON_PRIMARIO}
          disabled={ocupado || !parada}
          onClick={async () => {
            setError(null);
            const e = await onConfirmar(Number(parada));
            if (e) setError(e);
            else {
              setAbierto(false);
              setParada('');
            }
          }}
        >
          {ocupado && <LoaderCircle className="size-4 animate-spin" />} Confirmar
        </button>
        <button type="button" className={BOTON_SECUNDARIO} onClick={() => setAbierto(false)} disabled={ocupado}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
