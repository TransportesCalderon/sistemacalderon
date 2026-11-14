'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { CambiarPasswordForm } from '@/app/(app)/perfil/cambiar-password-form';
import { browserDb } from '@/shared/supabase/browser';
import { invalidar } from '@/shared/query/invalidar';

/**
 * Migración 192 · Si TI le puso una contraseña provisoria, el usuario tiene que elegir la suya antes de
 * seguir (ventana que no se cierra). Lo decide la base (seg.fn_debo_cambiar_clave).
 */
export function CambioClaveObligatorio() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['usuarios', 'debo-cambiar-clave'],
    queryFn: async () => {
      const { data, error } = await browserDb().schema('seg').rpc('fn_debo_cambiar_clave');
      if (error) return false;
      return data === true;
    },
    staleTime: 5 * 60_000,
  });
  if (!data) return null;
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4" role="alertdialog" aria-modal="true" aria-labelledby="titulo-clave">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-borde bg-panel p-5 shadow-xl">
        <h2 id="titulo-clave" className="flex items-center gap-2 text-lg font-semibold text-tinta">
          <KeyRound className="size-5" /> Elegí tu contraseña
        </h2>
        <p className="text-sm text-tinta-suave">Entraste con una contraseña provisoria. Para seguir, elegí una propia.</p>
        <CambiarPasswordForm onListo={() => void invalidar(qc, 'clave')} />
      </div>
    </div>
  );
}
