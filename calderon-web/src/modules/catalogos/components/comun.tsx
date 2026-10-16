'use client';

import { useState, type ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';
import { ErrorBase } from '@/modules/combustible/components/comun/ui';
import type { ActionResult, ErrorAccion } from '@/server/actions/result';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from '@/shared/ui/clases';

export const TH = 'px-3 py-2.5 text-left text-xs font-medium tracking-wide text-tinta-suave uppercase';
export const TD = 'px-3 py-2.5 align-top';

/** Envío de una acción: guarda el error de la base para mostrarlo sin reinterpretar. */
export function useEnvio() {
  const [error, setError] = useState<ErrorAccion | null>(null);
  const enviar = async (p: Promise<ActionResult<unknown>>, onBien: () => void) => {
    setError(null);
    const r = await p;
    if (r.ok) onBien();
    else setError(r.error);
  };
  return { error, setError, enviar, campo: (n: string) => error?.campos?.[n] };
}

/** Panel de formulario (alta, edición o confirmación) dentro de una lista. */
export function Panel({
  titulo,
  explicacion,
  error,
  ocupado,
  textoBoton,
  onConfirmar,
  onCerrar,
  children,
}: {
  titulo: string;
  explicacion?: ReactNode;
  error: ErrorAccion | null;
  ocupado: boolean;
  textoBoton: string;
  onConfirmar: () => void;
  onCerrar: () => void;
  children?: ReactNode;
}) {
  return (
    <form
      noValidate
      className="space-y-3 rounded-lg border border-borde bg-fondo/40 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onConfirmar();
      }}
    >
      <h3 className="font-medium text-tinta">{titulo}</h3>
      {explicacion && <p className="text-sm text-tinta-suave">{explicacion}</p>}
      {children && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>}
      <ErrorBase error={error} />
      <div className="flex flex-wrap gap-3">
        <button type="submit" className={BOTON_PRIMARIO} disabled={ocupado}>
          {ocupado && <LoaderCircle className="size-4 animate-spin" />} {textoBoton}
        </button>
        <button type="button" className={BOTON_SECUNDARIO} onClick={onCerrar} disabled={ocupado}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
