'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ChevronDown, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { entradaActual, type GrupoMenu } from '@/modules/core/navigation/navigation';
import { ICONO_GRUPO } from './iconos';

const CLAVE_GRUPOS = 'tc.sidebar.grupos';

export function leerLocal<T>(clave: string, defecto: T): T {
  try {
    const v = window.localStorage.getItem(clave);
    return v ? (JSON.parse(v) as T) : defecto;
  } catch {
    return defecto;
  }
}

export function guardarLocal(clave: string, valor: unknown) {
  try {
    window.localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    // almacenamiento no disponible (modo privado): se ignora
  }
}

interface SidebarProps {
  menu: GrupoMenu[];
  plegado: boolean;
  onAlternarPlegado: () => void;
  abiertoMovil: boolean;
  onCerrarMovil: () => void;
}

/**
 * Menú lateral dinámico: recibe del servidor solo los grupos y entradas que el rol
 * puede ver (menuVisible). Recuerda el estado plegado y los grupos abiertos por usuario.
 */
export function Sidebar({ menu, plegado, onAlternarPlegado, abiertoMovil, onCerrarMovil }: SidebarProps) {
  const pathname = usePathname();
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});
  const actualHref = entradaActual(pathname, menu.flatMap((g) => g.entradas));

  useEffect(() => {
    setAbiertos(leerLocal<Record<string, boolean>>(CLAVE_GRUPOS, {}));
  }, []);

  // Cerrar el panel móvil al navegar
  useEffect(() => {
    onCerrarMovil();
  }, [pathname, onCerrarMovil]);

  // Un grupo abierto a la vez: abrir uno cierra los demás (menos cosas a la vista).
  const alternarGrupo = (id: string, activo: boolean) => {
    setAbiertos((prev) => {
      const actual = prev[id] ?? activo;
      const nuevo = Object.fromEntries(menu.map((g) => [g.id, false])) as Record<string, boolean>;
      nuevo[id] = !actual;
      guardarLocal(CLAVE_GRUPOS, nuevo);
      return nuevo;
    });
  };

  return (
    <>
      {abiertoMovil && (
        <button
          type="button"
          aria-label="Cerrar menú"
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={onCerrarMovil}
        />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-borde bg-panel transition-[width,transform] duration-200',
          plegado ? 'lg:w-16' : 'lg:w-64',
          'w-72 lg:translate-x-0',
          abiertoMovil ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Menú principal"
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-borde px-3">
          <Link href="/" className={cn('flex items-center gap-2 font-semibold text-tinta', plegado && 'lg:hidden')}>
            <span className="grid size-8 place-items-center rounded-md bg-marca text-sm font-bold text-white">TC</span>
            <span className="truncate">Transportes Calderón</span>
          </Link>
          <button
            type="button"
            onClick={onAlternarPlegado}
            className="hidden rounded-md p-1.5 text-tinta-suave hover:bg-hover lg:block"
            aria-label={plegado ? 'Expandir menú' : 'Plegar menú'}
          >
            {plegado ? <PanelLeftOpen className="size-5" /> : <PanelLeftClose className="size-5" />}
          </button>
          <button type="button" onClick={onCerrarMovil} className="rounded-md p-1.5 text-tinta-suave hover:bg-hover lg:hidden" aria-label="Cerrar menú">
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          <ul className="space-y-1">
            {menu.map((grupo) => {
              const Icono = ICONO_GRUPO[grupo.id];
              const activo = grupo.entradas.some((e) => e.href === actualHref);
              const abierto = abiertos[grupo.id] ?? activo;
              const unico = grupo.entradas.length === 1 ? grupo.entradas[0] : undefined;

              if (plegado) {
                const destino = grupo.entradas[0];
                return (
                  <li key={grupo.id} className="hidden lg:block">
                    <Link
                      href={destino?.href ?? '/'}
                      title={grupo.etiqueta}
                      className={cn(
                        'flex h-10 items-center justify-center rounded-md text-tinta-suave hover:bg-hover',
                        activo && 'bg-marca-suave text-marca',
                      )}
                    >
                      <Icono className="size-5" />
                    </Link>
                  </li>
                );
              }

              if (unico) {
                return (
                  <li key={grupo.id}>
                    <Link
                      href={unico.href}
                      className={cn(
                        'flex h-9 items-center gap-3 rounded-md px-2 text-sm font-medium text-tinta hover:bg-hover',
                        activo && 'bg-marca-suave text-marca',
                      )}
                    >
                      <Icono className="size-5 shrink-0" />
                      {grupo.etiqueta}
                    </Link>
                  </li>
                );
              }

              return (
                <li key={grupo.id}>
                  <button
                    type="button"
                    onClick={() => alternarGrupo(grupo.id, activo)}
                    aria-expanded={abierto}
                    className={cn(
                      'flex h-9 w-full items-center gap-3 rounded-md px-2 text-sm font-medium text-tinta hover:bg-hover',
                      activo && 'text-marca',
                    )}
                  >
                    <Icono className="size-5 shrink-0" />
                    <span className="flex-1 text-left">{grupo.etiqueta}</span>
                    <ChevronDown className={cn('size-4 text-tinta-suave transition-transform', abierto && 'rotate-180')} />
                  </button>
                  {abierto && (
                    <ul className="mt-1 mb-2 space-y-0.5 border-l border-borde pl-3 ml-4.5">
                      {grupo.entradas.map((entrada) => {
                        const actual = entrada.href === actualHref;
                        return (
                          <li key={entrada.href}>
                            <Link
                              href={entrada.href}
                              aria-current={actual ? 'page' : undefined}
                              className={cn(
                                'block rounded-md px-2 py-1.5 text-sm text-tinta-suave hover:bg-hover hover:text-tinta',
                                actual && 'bg-marca-suave font-medium text-marca hover:text-marca',
                              )}
                            >
                              {entrada.etiqueta}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>
    </>
  );
}
