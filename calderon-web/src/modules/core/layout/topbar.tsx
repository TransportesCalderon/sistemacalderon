'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, ChevronDown, CircleDollarSign, Clock, LogOut, Menu, Search, UserRound } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { useSesion } from '@/modules/core/session/session-provider';
import { ETIQUETA_ROL } from '@/modules/core/permissions/roles';
import { cambiarZonaHoraria, cerrarSesion } from '@/modules/core/auth/actions';
import { ZONAS_HORARIAS } from '@/modules/core/auth/zonas';

/**
 * Barra superior (especificación §3): buscador global, zona horaria de visualización,
 * moneda base, notificaciones y menú de usuario.
 * El buscador y las notificaciones se conectan cuando existan los módulos de negocio.
 */
export function Topbar({ onAbrirMenu }: { onAbrirMenu: () => void }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-borde bg-panel/95 px-4 backdrop-blur">
      <button type="button" onClick={onAbrirMenu} className="rounded-md p-1.5 text-tinta-suave hover:bg-hover lg:hidden" aria-label="Abrir menú">
        <Menu className="size-5" />
      </button>
      <BuscadorGlobal />
      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <SelectorZona />
        <IndicadorMoneda />
        <Notificaciones />
        <MenuUsuario />
      </div>
    </header>
  );
}

function BuscadorGlobal() {
  return (
    <form role="search" className="hidden max-w-md flex-1 md:block" onSubmit={(e) => e.preventDefault()}>
      <label className="relative block">
        <span className="sr-only">Buscar</span>
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-tinta-suave" />
        <input
          type="search"
          disabled
          placeholder="Buscar patente, servicio, legajo o cliente"
          title="Disponible cuando se habiliten los módulos de negocio"
          className="h-9 w-full rounded-md border border-borde bg-fondo pr-3 pl-8 text-sm placeholder:text-tinta-suave disabled:cursor-not-allowed disabled:opacity-70"
        />
      </label>
    </form>
  );
}

function SelectorZona() {
  const { zonaHoraria } = useSesion();
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();

  return (
    <label className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-tinta-suave hover:bg-hover" title="Zona horaria en la que se muestran las fechas">
      <Clock className="size-4" />
      <span className="sr-only">Zona horaria</span>
      <select
        value={zonaHoraria}
        disabled={pendiente}
        onChange={(e) =>
          iniciar(async () => {
            await cambiarZonaHoraria(e.target.value);
            router.refresh();
          })
        }
        className="cursor-pointer bg-transparent text-tinta outline-none"
      >
        {ZONAS_HORARIAS.map((z) => (
          <option key={z.id} value={z.id}>
            {z.etiqueta}
          </option>
        ))}
      </select>
    </label>
  );
}

function IndicadorMoneda() {
  const { monedaBase } = useSesion();
  return (
    <span
      className={cn(
        'hidden items-center gap-1.5 rounded-md px-2 py-1 text-sm sm:flex',
        monedaBase ? 'text-tinta-suave' : 'bg-alerta-suave text-alerta',
      )}
      title={monedaBase ? 'Moneda base: todos los importes se comparan en esta moneda' : 'Moneda base no definida'}
    >
      <CircleDollarSign className="size-4" />
      {monedaBase ?? 'Sin moneda base'}
    </span>
  );
}

function Notificaciones() {
  return (
    <button
      type="button"
      disabled
      className="relative rounded-md p-2 text-tinta-suave hover:bg-hover disabled:cursor-not-allowed disabled:opacity-70"
      aria-label="Notificaciones"
      title="Las notificaciones se activan con los módulos de anomalías y combustible"
    >
      <Bell className="size-5" />
    </button>
  );
}

function MenuUsuario() {
  const { email, rolesApp } = useSesion();
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    };
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false);
    document.addEventListener('mousedown', cerrar);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', cerrar);
      document.removeEventListener('keydown', escape);
    };
  }, [abierto]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-haspopup="menu"
        aria-expanded={abierto}
        className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-hover"
      >
        <span className="grid size-7 place-items-center rounded-full bg-marca-suave text-marca">
          <UserRound className="size-4" />
        </span>
        <span className="hidden max-w-40 truncate text-tinta md:inline">{email}</span>
        <ChevronDown className="size-4 text-tinta-suave" />
      </button>
      {abierto && (
        <div role="menu" className="absolute right-0 mt-2 w-64 rounded-lg border border-borde bg-panel p-2 shadow-lg">
          <div className="border-b border-borde px-2 pb-2">
            <p className="truncate text-sm font-medium text-tinta">{email}</p>
            <p className="mt-1 text-xs text-tinta-suave">{rolesApp.map((r) => ETIQUETA_ROL[r]).join(' · ') || 'Sin roles'}</p>
          </div>
          <Link
            href="/perfil"
            role="menuitem"
            onClick={() => setAbierto(false)}
            className="mt-2 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-tinta hover:bg-hover"
          >
            <UserRound className="size-4" />
            Mi perfil
          </Link>
          <form action={cerrarSesion}>
            <button type="submit" role="menuitem" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-tinta hover:bg-hover">
              <LogOut className="size-4" />
              Cerrar sesión
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
