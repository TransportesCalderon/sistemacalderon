'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import type { GrupoMenu } from '@/modules/core/navigation/navigation';
import { guardarLocal, leerLocal, Sidebar } from './sidebar';
import { BarraSuperior } from './topbar';
import { BotonAsistente } from '@/modules/ia/asistente/asistente-boton';

const CLAVE_PLEGADO = 'tc.sidebar.plegado';

/** Estructura de la aplicación: Sidebar fijo + barra superior (con el buscador) + contenido. */
export function AppShell({ menu, aviso, children }: { menu: GrupoMenu[]; aviso?: ReactNode; children: ReactNode }) {
  const [plegado, setPlegado] = useState(false);
  const [abiertoMovil, setAbiertoMovil] = useState(false);

  useEffect(() => setPlegado(leerLocal(CLAVE_PLEGADO, false)), []);

  const alternarPlegado = useCallback(() => {
    setPlegado((p) => {
      guardarLocal(CLAVE_PLEGADO, !p);
      return !p;
    });
  }, []);
  const cerrarMovil = useCallback(() => setAbiertoMovil(false), []);
  const abrirMovil = useCallback(() => setAbiertoMovil(true), []);

  return (
    <div className="min-h-dvh bg-fondo">
      <Sidebar
        menu={menu}
        plegado={plegado && !abiertoMovil}
        onAlternarPlegado={alternarPlegado}
        abiertoMovil={abiertoMovil}
        onCerrarMovil={cerrarMovil}
      />
      <div className={cn('flex min-h-dvh flex-col transition-[padding] duration-200', plegado ? 'lg:pl-16' : 'lg:pl-64')}>
        <BarraSuperior onAbrirMenu={abrirMovil} />
        {aviso}
        {/* pb-24: que el botón flotante de Iris no tape lo último de la pantalla */}
        <main className="flex-1 px-4 pb-24 pt-6 sm:px-6 lg:px-8">{children}</main>
      </div>
      {/* Iris: botón flotante abajo a la derecha (lo ve quien la base deja usarlo) */}
      <BotonAsistente />
    </div>
  );
}
