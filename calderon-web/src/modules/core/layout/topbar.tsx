'use client';

import { Suspense, useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronDown, CircleDollarSign, Clock, Ellipsis, House, LayoutGrid, LogOut, MapPin, UserRound } from 'lucide-react';
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
import { itemActual, type GrupoMasVisible } from '@/modules/core/navigation/filtrar';

/**
 * Barra superior. Sprint 2: Pizarra a mano, el buscador en el centro y el menú del usuario (con la
 * zona horaria y la moneda base). Sprint 3: «Hoy» con su contador. Mapa de flota al lado de la
 * Pizarra, con la misma importancia (29/10/2026).
 * Sprint 8 (ítem 35): no hay menú lateral. La barra tiene el logo (lleva al inicio de la persona),
 * Hoy, Pizarra, Mapa, el buscador, «Más» y el usuario. En el celular, Hoy, Pizarra, Mapa y Más van
 * en una barra abajo (BarraInferior). El chofer no tiene buscador ni «Más»: solo Mi viaje.
 */
export function BarraSuperior({ mas, inicio }: { mas: GrupoMasVisible[]; inicio: string }) {
  const { rolesApp } = useSesion();
  const hayBuscador = useBaseTiene(VERSION_BUSCADOR) && rolesApp.some((r) => r !== 'chofer');
  const { verHoy, verPizarra, verMapa, enHoy, enPizarra, enMapa } = useAccesos();
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-borde bg-panel/95 px-4 backdrop-blur sm:gap-3">
      <Link href={inicio} className="flex shrink-0 items-center gap-2 font-semibold text-tinta" title="Inicio">
        <span className="grid size-8 place-items-center rounded-md bg-marca text-sm font-bold text-white">TC</span>
        <span className="hidden truncate xl:inline">Transportes Calderón</span>
      </Link>
      {verHoy && <BotonHoy actual={enHoy} />}
      {verPizarra && (
        <BotonBarra href="/pizarra" actual={enPizarra} icono={<LayoutGrid className="size-4" />}>
          Pizarra
        </BotonBarra>
      )}
      {verMapa && (
        <BotonBarra href="/pizarra/mapa" actual={enMapa} icono={<MapPin className="size-4" />}>
          Mapa
        </BotonBarra>
      )}
      <div className="flex min-w-0 flex-1 justify-center">
        {hayBuscador && (
          <Suspense fallback={null}>
            <Buscador />
          </Suspense>
        )}
      </div>
      {mas.length > 0 && (
        <div className="hidden md:block">
          <MenuMas mas={mas} />
        </div>
      )}
      <MenuUsuario />
    </header>
  );
}

/** Qué botones ve la persona y cuál es el de la página actual (el de Mapa no marca también Pizarra). */
function useAccesos() {
  const pathname = usePathname();
  const enMapa = pathname === '/pizarra/mapa';
  return {
    verHoy: useCan('inicio.hoy:ver'),
    verPizarra: useCan('flota.pizarra:ver'),
    verMapa: useCan('telemetria.mapa:ver'),
    enHoy: pathname === '/hoy',
    enMapa,
    enPizarra: pathname.startsWith('/pizarra') && !enMapa,
  };
}

function BotonBarra({ href, actual, icono, children }: { href: string; actual: boolean; icono: ReactNode; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={actual ? 'page' : undefined}
      className={cn(
        'hidden items-center gap-1.5 rounded-md px-2 py-1.5 text-sm md:flex',
        actual ? 'bg-marca-suave font-medium text-marca' : 'text-tinta-suave hover:bg-hover hover:text-tinta',
      )}
    >
      {icono}
      {children}
    </Link>
  );
}

/**
 * Sprint 8: en el celular, abajo, Hoy, Pizarra, Mapa y Más (reemplaza al ☰ del menú lateral).
 * No aparece si la persona no tiene ninguno (el chofer).
 */
export function BarraInferior({ mas }: { mas: GrupoMasVisible[] }) {
  const { verHoy, verPizarra, verMapa, enHoy, enPizarra, enMapa } = useAccesos();
  const { data, activo } = useHoy();
  const n = verHoy && activo ? contarPendientes(data ?? []) : 0;
  const [abierto, setAbierto] = useState(false);
  if (!verHoy && !verPizarra && !verMapa && mas.length === 0) return null;
  const clase = (actual: boolean) =>
    cn('flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]', actual ? 'font-semibold text-marca' : 'text-tinta-suave');
  return (
    <>
      <nav aria-label="Navegación" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-borde bg-panel pb-[env(safe-area-inset-bottom)] md:hidden">
        {verHoy && (
          <Link href="/hoy" aria-current={enHoy ? 'page' : undefined} className={clase(enHoy)}>
            <span className="relative">
              <House className="size-5" />
              {n > 0 && (
                <span className="absolute -top-1.5 -right-3 rounded-full bg-marca px-1 text-[10px] leading-4 font-semibold text-white tabular-nums">
                  {n > 99 ? '99+' : n}
                </span>
              )}
            </span>
            Hoy
          </Link>
        )}
        {verPizarra && (
          <Link href="/pizarra" aria-current={enPizarra ? 'page' : undefined} className={clase(enPizarra)}>
            <LayoutGrid className="size-5" />
            Pizarra
          </Link>
        )}
        {verMapa && (
          <Link href="/pizarra/mapa" aria-current={enMapa ? 'page' : undefined} className={clase(enMapa)}>
            <MapPin className="size-5" />
            Mapa
          </Link>
        )}
        {mas.length > 0 && (
          <button type="button" aria-expanded={abierto} onClick={() => setAbierto((a) => !a)} className={clase(abierto)}>
            <Ellipsis className="size-5" />
            Más
          </button>
        )}
      </nav>
      {abierto && (
        // Arriba de la barra de abajo, que queda a la vista (Más la vuelve a cerrar)
        <div className="fixed inset-x-0 top-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 md:hidden" onClick={() => setAbierto(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            role="dialog"
            aria-label="Más"
            className="absolute inset-x-0 bottom-0 max-h-[75dvh] overflow-y-auto rounded-t-2xl bg-panel p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <PanelMas mas={mas} onElegir={() => setAbierto(false)} />
          </div>
        </div>
      )}
    </>
  );
}

/** «Más» en la barra de arriba (computadora): un panel con Trabajo, Análisis y Ajustes. */
function MenuMas({ mas }: { mas: GrupoMasVisible[] }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const actual = itemActual(pathname, mas) !== null;

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
        className={cn(
          'flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm',
          actual || abierto ? 'bg-marca-suave font-medium text-marca' : 'text-tinta-suave hover:bg-hover hover:text-tinta',
        )}
      >
        <Ellipsis className="size-4" />
        Más
        <ChevronDown className="size-4" />
      </button>
      {abierto && (
        <div className="absolute right-0 mt-2 w-[min(760px,calc(100vw-2rem))] rounded-lg border border-borde bg-panel p-4 shadow-lg">
          <PanelMas mas={mas} onElegir={() => setAbierto(false)} />
        </div>
      )}
    </div>
  );
}

function PanelMas({ mas, onElegir }: { mas: GrupoMasVisible[]; onElegir: () => void }) {
  const pathname = usePathname();
  const actual = itemActual(pathname, mas);
  return (
    <div className="grid gap-5 md:grid-cols-3">
      {mas.map((g) => (
        <section key={g.id}>
          <h2 className="mb-1.5 px-2 text-xs font-semibold tracking-wide text-tinta-suave uppercase">{g.etiqueta}</h2>
          <ul className="space-y-0.5">
            {g.items.map((i) => (
              <li key={i.href}>
                <Link
                  href={i.href}
                  onClick={onElegir}
                  aria-current={actual === i.href ? 'page' : undefined}
                  className={cn(
                    'block rounded-md px-2 py-1.5 text-sm',
                    actual === i.href ? 'bg-marca-suave font-medium text-marca' : 'text-tinta hover:bg-hover',
                  )}
                >
                  {i.etiqueta}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
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
