'use client';

import { Suspense, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronDown, CircleDollarSign, Clock, House, LayoutGrid, LogOut, MapPin, Menu, UserRound } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { useSesion } from '@/modules/core/session/session-provider';
import { useCan } from '@/modules/core/permissions/can';
import { ETIQUETA_ROL } from '@/modules/core/permissions/roles';
import { cambiarZonaHoraria, cerrarSesion } from '@/modules/core/auth/actions';
import { ZONAS_HORARIAS } from '@/modules/core/auth/zonas';
import { Buscador } from '@/modules/core/buscador/buscador';
import { VERSION_BUSCADOR } from '@/modules/core/buscador/resultados';
import { contarPendientes } from '@/modules/hoy/hoy';
import { useHoy } from '@/modules/hoy/use-hoy';
import { BotonAsistente } from '@/modules/ia/asistente/asistente-boton';

/**
 * Barra superior (Sprint 2, Plan de migración UX ítems 6 a 8): Pizarra a mano, el buscador
 * en el centro y el menú del usuario, que ahora también tiene la zona horaria y la moneda base.
 * Sprint 3: «Hoy» con el contador de lo que espera una acción tuya. El chofer no tiene buscador.
 */
export function BarraSuperior({ onAbrirMenu }: { onAbrirMenu: () => void }) {
  const { rolesApp } = useSesion();
  const hayBuscador = useBaseTiene(VERSION_BUSCADOR) && rolesApp.some((r) => r !== 'chofer');
  const verPizarra = useCan('flota.pizarra:ver');
  const verHoy = useCan('inicio.hoy:ver');
  const verMapa = useCan('telemetria.mapa:ver');
  const pathname = usePathname();
  const enMapa = pathname === '/pizarra/mapa';
  const enPizarra = pathname.startsWith('/pizarra') && !enMapa;
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-borde bg-panel/95 px-4 backdrop-blur sm:gap-3">
      <button type="button" onClick={onAbrirMenu} className="rounded-md p-1.5 text-tinta-suave hover:bg-hover lg:hidden" aria-label="Abrir menú">
        <Menu className="size-5" />
      </button>
      {verHoy && <BotonHoy actual={pathname === '/hoy'} />}
      {verPizarra && (
        <Link
          href="/pizarra"
          aria-current={enPizarra ? 'page' : undefined}
          className={cn(
            'hidden items-center gap-1.5 rounded-md px-2 py-1.5 text-sm md:flex',
            enPizarra ? 'bg-marca-suave font-medium text-marca' : 'text-tinta-suave hover:bg-hover hover:text-tinta',
          )}
        >
          <LayoutGrid className="size-4" />
          Pizarra
        </Link>
      )}
      {/* El mapa de flota, a mano igual que la Pizarra */}
      {verMapa && (
        <Link
          href="/pizarra/mapa"
          aria-current={enMapa ? 'page' : undefined}
          className={cn(
            'hidden items-center gap-1.5 rounded-md px-2 py-1.5 text-sm md:flex',
            enMapa ? 'bg-marca-suave font-medium text-marca' : 'text-tinta-suave hover:bg-hover hover:text-tinta',
          )}
        >
          <MapPin className="size-4" />
          Mapa
        </Link>
      )}
      {/* IA-3: el asistente, al lado de Hoy, Pizarra y Mapa (lo ve quien la base deja usarlo) */}
      <BotonAsistente />
      <div className="flex min-w-0 flex-1 justify-center">
        {hayBuscador && (
          <Suspense fallback={null}>
            <Buscador />
          </Suspense>
        )}
      </div>
      <MenuUsuario />
    </header>
  );
}

/** «Hoy» con el número de cosas que esperan una acción tuya (la misma consulta que la pantalla). */
function BotonHoy({ actual }: { actual: boolean }) {
  const { data, activo } = useHoy();
  const n = activo ? contarPendientes(data ?? []) : 0;
  return (
    <Link
      href="/hoy"
      aria-current={actual ? 'page' : undefined}
      title={n > 0 ? `${n} cosa(s) esperan una acción tuya` : 'Lo que te toca hoy'}
      className={cn(
        'hidden items-center gap-1.5 rounded-md px-2 py-1.5 text-sm md:flex',
        actual ? 'bg-marca-suave font-medium text-marca' : 'text-tinta-suave hover:bg-hover hover:text-tinta',
      )}
    >
      <House className="size-4" />
      Hoy
      {n > 0 && <span className="rounded-full bg-marca px-1.5 text-xs font-semibold leading-5 text-white tabular-nums">{n > 99 ? '99+' : n}</span>}
    </Link>
  );
}

/** Nombre anterior (se mantiene para no romper importaciones). */
export const Topbar = BarraSuperior;

function SelectorZona() {
  const { zonaHoraria } = useSesion();
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();

  return (
    <label className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-tinta-suave hover:bg-hover" title="Zona horaria en la que se muestran las fechas">
      <Clock className="size-4 shrink-0" />
      <span className="shrink-0">Horario</span>
      <select
        value={zonaHoraria}
        disabled={pendiente}
        onChange={(e) =>
          iniciar(async () => {
            await cambiarZonaHoraria(e.target.value);
            router.refresh();
          })
        }
        className="min-w-0 flex-1 cursor-pointer bg-transparent text-tinta outline-none"
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
    <p
      className={cn('flex items-center gap-2 rounded-md px-2 py-1.5 text-sm', monedaBase ? 'text-tinta-suave' : 'bg-alerta-suave text-alerta')}
      title={monedaBase ? 'Moneda base: todos los importes se comparan en esta moneda' : 'Moneda base no definida'}
    >
      <CircleDollarSign className="size-4 shrink-0" />
      Moneda base: <span className="font-medium">{monedaBase ?? 'sin definir'}</span>
    </p>
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
          {/* Sprint 2: la zona horaria y la moneda base pasan acá desde la barra */}
          <div className="mt-2 space-y-1 border-b border-borde pb-2">
            <SelectorZona />
            <IndicadorMoneda />
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
