'use client';

import { useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';

/**
 * Filtros de lista en la URL: aplica cambios, vuelve a la página 1 salvo que se pida
 * conservarla, y quita los valores vacíos.
 */
export function useFiltrosUrl<P extends { pagina: number }>(actuales: P, serializar: (p: P) => string) {
  const router = useRouter();
  const pathname = usePathname();
  const [navegando, iniciar] = useTransition();
  const actualizar = (cambios: Partial<P>, conservarPagina = false) => {
    const siguiente = { ...actuales, ...cambios } as P;
    if (!conservarPagina) siguiente.pagina = 1;
    for (const k of Object.keys(siguiente) as (keyof P)[]) {
      const v = siguiente[k];
      if (v === undefined || v === '' || v === false) delete siguiente[k];
    }
    const qs = serializar(siguiente);
    iniciar(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };
  const limpiar = () => iniciar(() => router.replace(pathname, { scroll: false }));
  return { actualizar, limpiar, navegando };
}
