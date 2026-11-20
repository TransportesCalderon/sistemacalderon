'use client';

import { useQueryClient } from '@tanstack/react-query';
import { KeyRound, X } from 'lucide-react';
import { CambiarPasswordForm } from '@/app/(app)/perfil/cambiar-password-form';
import { invalidar } from '@/shared/query/invalidar';
import { useClienteDeboCambiarClave } from '../queries/hooks';

/**
 * Migración 288 · La contraseña del usuario de un cliente. Si TI le puso una provisoria, la ventana no se
 * cierra hasta que elija la suya (lo dice la base); si no, la abre «Cambiar contraseña».
 */
export function ClaveCliente({ abierta, onCerrar }: { abierta: boolean; onCerrar: () => void }) {
  const qc = useQueryClient();
  const obligatoria = useClienteDeboCambiarClave().data === true;
  if (!obligatoria && !abierta) return null;
  return (
    <div className="fixed inset-0 z-[1100] grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="titulo-clave-cliente">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-borde bg-panel p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <h2 id="titulo-clave-cliente" className="flex items-center gap-2 text-lg font-semibold text-tinta">
            <KeyRound className="size-5" /> {obligatoria ? 'Elegí tu contraseña' : 'Cambiar contraseña'}
          </h2>
          {!obligatoria && (
            <button type="button" onClick={onCerrar} className="rounded-md p-1 text-tinta-suave hover:bg-hover" aria-label="Cerrar">
              <X className="size-5" />
            </button>
          )}
        </div>
        {obligatoria && <p className="text-sm text-tinta-suave">Entraste con una contraseña provisoria. Para seguir, elegí una propia.</p>}
        <CambiarPasswordForm onListo={() => void invalidar(qc, 'clave')} />
      </div>
    </div>
  );
}
