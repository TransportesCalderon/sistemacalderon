'use client';

import { useState } from 'react';
import { CalendarClock, LoaderCircle } from 'lucide-react';
import { CLASE_TEXTAREA, ErrorBase } from '@/modules/combustible/components/comun/ui';
import type { ErrorAccion } from '@/server/actions/result';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';

/**
 * Migración 273 · Cambiar la fecha de un cobro ya registrado (por ejemplo, uno de octubre que se cargó en noviembre).
 * Pide la fecha y el motivo; los controles (no futura, no antes de la factura, no conciliado) los hace la base.
 */
export function CambiarFechaCobro({
  fechaActual,
  ocupado,
  onGuardar,
}: {
  fechaActual: string;
  ocupado: boolean;
  /** Devuelve el error de la base, o null si salió bien. */
  onGuardar: (fecha: string, motivo: string) => Promise<ErrorAccion | null>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [fecha, setFecha] = useState(fechaActual);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<ErrorAccion | null>(null);
  if (!abierto) {
    return (
      <button
        type="button"
        className={BOTON_SECUNDARIO}
        onClick={() => {
          setFecha(fechaActual);
          setMotivo('');
          setError(null);
          setAbierto(true);
        }}
      >
        <CalendarClock className="size-4" /> Cambiar la fecha del cobro
      </button>
    );
  }
  return (
    <div className="w-full space-y-3 rounded-lg border border-borde p-4 text-left">
      <h3 className="font-medium text-tinta">Cambiar la fecha del cobro</h3>
      <Campo label="Fecha en que se cobró">
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </Campo>
      <label className="block space-y-1.5">
        <span className="block text-sm font-medium text-tinta">Motivo *</span>
        <textarea rows={2} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} className={CLASE_TEXTAREA} />
      </label>
      <ErrorBase error={error} />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BOTON_PRIMARIO}
          disabled={ocupado}
          onClick={async () => {
            setError(null);
            const e = await onGuardar(fecha, motivo);
            if (e) setError(e);
            else setAbierto(false);
          }}
        >
          {ocupado && <LoaderCircle className="size-4 animate-spin" />} Guardar la fecha
        </button>
        <button type="button" className={BOTON_SECUNDARIO} disabled={ocupado} onClick={() => setAbierto(false)}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
