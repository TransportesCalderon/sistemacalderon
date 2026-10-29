'use client';

import type { ReactNode } from 'react';
import type { GrupoMasVisible } from '@/modules/core/navigation/filtrar';
import { BarraInferior, BarraSuperior } from './topbar';

/**
 * Estructura de la aplicación. Sprint 8 (ítem 35): sin menú lateral. Arriba la barra (logo, Hoy,
 * Pizarra, Mapa, buscador, Más y usuario); en el celular, abajo, Hoy, Pizarra, Mapa y Más.
 */
export function AppShell({ mas, inicio, aviso, children }: { mas: GrupoMasVisible[]; inicio: string; aviso?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-fondo">
      <BarraSuperior mas={mas} inicio={inicio} />
      {aviso}
      {/* En el celular, lugar para la barra de abajo */}
      <main className="flex-1 px-4 pt-6 pb-24 sm:px-6 md:pb-6 lg:px-8">{children}</main>
      <BarraInferior mas={mas} />
    </div>
  );
}
