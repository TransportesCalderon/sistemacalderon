'use client';

import { useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import type { ErrorAccion } from '@/server/actions/result';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { BOTON_SECUNDARIO } from '@/shared/ui/clases';
import type { FechaISO } from '@/shared/types/dominio';
import type { HistorialConforme } from '../domain/operacion.types';
import { useMarcarConforme } from '../queries/hooks';

/**
 * Migración 176 · La tilde de «llegó el conforme de descarga». Se ve y se cambia en la ficha de la
 * operación y en Facturación (Por facturar). Quién puede, lo decide la base (Operaciones, Finanzas o TI).
 * Migración 227: marcarlo sigue siendo una tilde; quitarlo abre un cuadro que pide el motivo (la base lo exige y
 * no deja si ya está facturada). La ficha muestra el historial.
 */
export function ConformeDescarga({
  servicioId,
  conformeEn,
  conformePor,
  historial = [],
  zona,
  compacto = false,
}: {
  servicioId: number;
  conformeEn: FechaISO | null;
  conformePor?: string | null;
  historial?: HistorialConforme[];
  zona: string;
  compacto?: boolean;
}) {
  const marcar = useMarcarConforme();
  const [error, setError] = useState<ErrorAccion | null>(null);
  const [quitando, setQuitando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const llego = conformeEn !== null;
  const enviar = async (v: boolean, m?: string) => {
    setError(null);
    const r = await marcar.mutateAsync({ servicioId, llego: v, motivo: m });
    if (!r.ok) setError(r.error);
    else {
      setQuitando(false);
      setMotivo('');
    }
  };
  const cambiar = (v: boolean) => {
    if (v) void enviar(true);
    else {
      setError(null);
      setQuitando(true);
    }
  };
  const quitados = historial.filter((h) => h.accion === 'quitado');

  return (
    <span className={cn('relative inline-flex flex-col', compacto ? 'items-center' : '')}>
      <label className={cn('inline-flex items-center gap-2', compacto ? 'text-xs' : 'text-sm')} title={llego ? 'Llegó el conforme de descarga' : 'Falta el conforme de descarga'}>
        <input
          type="checkbox"
          className="size-4 accent-marca"
          checked={llego && !quitando}
          disabled={marcar.isPending || quitando}
          onChange={(e) => cambiar(e.target.checked)}
          aria-label="Llegó el conforme de descarga"
        />
        {!compacto && <span className="text-tinta">Llegó el conforme de descarga</span>}
      </label>
      {!compacto && llego && (
        <span className="text-xs text-tinta-suave">
          {formatearFechaHora(conformeEn, zona)}
          {conformePor && ` · ${conformePor}`}
        </span>
      )}
      {!compacto && quitados.length > 0 && (
        <span className="text-xs text-tinta-suave">
          {quitados.map((h, i) => (
            <span key={i} className="block">
              Quitado el {formatearFechaHora(h.en, zona)}
              {h.por && ` por ${h.por}`}: {h.motivo}
            </span>
          ))}
        </span>
      )}
      {quitando && (
        <span className={cn(compacto && 'fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4')}>
          <span
            className="z-20 mt-2 flex w-72 flex-col gap-2 rounded-lg border border-alerta/50 bg-panel p-3 text-left shadow-lg"
            role="dialog"
            aria-modal={compacto}
            aria-label="Quitar el conforme de descarga"
          >
            <span className="flex items-start gap-2 text-sm font-medium text-tinta">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-alerta" />
              ¿Quitar el conforme de descarga? Queda registrado quién lo quitó y por qué.
            </span>
            <textarea
              className="min-h-16 rounded-md border border-borde bg-panel p-2 text-sm"
              placeholder="Motivo (por ejemplo: se marcó en la operación equivocada)"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              autoFocus
            />
            <span className="flex gap-2">
              <button
                type="button"
                className="rounded-md bg-error px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
                disabled={marcar.isPending}
                onClick={() => void enviar(false, motivo)}
              >
                Quitar el conforme
              </button>
              <button
                type="button"
                className={BOTON_SECUNDARIO}
                onClick={() => {
                  setQuitando(false);
                  setMotivo('');
                  setError(null);
                }}
              >
                Cancelar
              </button>
            </span>
            {error && <span className="text-xs text-error">{error.mensaje}</span>}
          </span>
        </span>
      )}
      {error && !quitando && <span className="text-xs text-error">{error.mensaje}</span>}
    </span>
  );
}
