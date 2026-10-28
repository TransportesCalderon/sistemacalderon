'use client';

import { createContext, useCallback, useContext, useEffect, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { conFicha, leerFicha, leerRastro, mismaFicha, type RefFicha, type TipoFicha } from './ficha-url';

/**
 * Sprint 1 · S1-04 y S1-07: lo que una ficha necesita saber cuando está dentro del panel.
 * Fuera del panel (la página de detalle de siempre) no hay contexto y todo sigue como antes.
 */
export interface ContextoFicha {
  actual: RefFicha;
  rastro: RefFicha[];
  /** Cierra el panel: la lista queda como estaba. */
  cerrar: () => void;
  /** Abre otra ficha en el mismo panel (la actual pasa al rastro). */
  abrir: (r: RefFicha) => void;
  /** La ficha informa su nombre (patente, apellido, número) para el título y el rastro. */
  nombrar: (r: RefFicha, nombre: string) => void;
}

export const FichaContext = createContext<ContextoFicha | null>(null);

/** Contexto del panel; null si la ficha se muestra como página. */
export function useFicha(): ContextoFicha | null {
  return useContext(FichaContext);
}

/** Lo que va solo en la página de detalle (por ejemplo, «← Camiones»): en el panel ya está la X. */
export function SoloEnPagina({ children }: { children: ReactNode }) {
  return useFicha() ? null : <>{children}</>;
}

/** Cada ficha llama a esto con su nombre corto (patente, apellido, «Carga #1234»). Fuera del panel no hace nada. */
export function useNombreFicha(nombre: string | null | undefined) {
  const ctx = useFicha();
  const tipo = ctx?.actual.tipo;
  const id = ctx?.actual.id;
  const nombrar = ctx?.nombrar;
  useEffect(() => {
    if (nombrar && tipo && id && nombre) nombrar({ tipo, id }, nombre);
  }, [nombrar, tipo, id, nombre]);
}

/**
 * Abre una ficha en el panel desde cualquier lado, conservando la lista y sus filtros.
 * Desde adentro del panel suma la ficha actual al rastro; desde la lista empieza un rastro nuevo.
 */
export function useAbrirFicha() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const ctx = useFicha();
  return useCallback(
    (tipo: TipoFicha, id: number) => {
      const nueva = { tipo, id };
      if (ctx) return ctx.abrir(nueva);
      router.push(`${pathname}${conFicha(params.toString(), nueva)}`, { scroll: false });
    },
    [ctx, router, pathname, params],
  );
}

/** true si la ficha de este registro está abierta (para resaltar su fila en la lista). */
export function useFichaAbierta(tipo: TipoFicha, id: number): boolean {
  return mismaFicha(leerFicha(useSearchParams().get('ficha')), { tipo, id });
}

/** Ficha y rastro de la dirección actual. */
export function useFichaDeLaDireccion(): { ficha: RefFicha | null; rastro: RefFicha[] } {
  const p = useSearchParams();
  return { ficha: leerFicha(p.get('ficha')), rastro: leerRastro(p.get('rastro')) };
}

