'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { browserDb } from '@/shared/supabase/browser';
import { invalidar } from '@/shared/query/invalidar';
import { corregirConRemito, descartarRemito, registrarRemito } from '../actions/remitos.actions';
import { remitosRepository } from '../repositories/remitos.repository';

/** Migración 277 · Remitos de las estaciones por resolver. */
const CLAVE = ['combustible', 'remitos', 'pendientes'] as const;

export const usePendientesRemitos = (activo: boolean) =>
  useQuery({ queryKey: CLAVE, queryFn: () => remitosRepository(browserDb()).pendientes(), enabled: activo, refetchInterval: activo ? 120_000 : false, retry: false });

function useAccion<A, R>(accion: (a: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: accion,
    onSuccess: async (r) => {
      if ((r as { ok?: boolean }).ok === false) return;
      await invalidar(qc, 'combustible'); // refresca todo lo de combustible, incluida esta lista
    },
  });
}

export const useRegistrarRemito = () => useAccion(registrarRemito);
export const useCorregirConRemito = () => useAccion(corregirConRemito);
export const useDescartarRemito = () => useAccion(descartarRemito);

/** Abre el PDF del remito en otra pestaña. Devuelve el error, si hubo. */
export async function abrirPdfRemito(id: number): Promise<string | null> {
  try {
    const { base64 } = await remitosRepository(browserDb()).pdf(id);
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : 'No se pudo abrir el remito';
  }
}
