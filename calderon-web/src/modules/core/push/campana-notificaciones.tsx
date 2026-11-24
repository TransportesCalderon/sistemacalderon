'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellRing, CheckCheck, ChevronRight } from 'lucide-react';
import { useSesion } from '@/modules/core/session/session-provider';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { invalidar } from '@/shared/query/invalidar';
import { browserDb } from '@/shared/supabase/browser';
import { TARJETA } from '@/shared/ui/clases';
import { numeroInsignia, parsearNotificaciones, textoPendientes, VERSION_NOTIFICACIONES, type MisNotificaciones, type Notificacion } from './notificaciones';
import { marcarNotificacionesVistas, marcarNotificacionVista } from './push.actions';

/**
 * Migración 306 · Notificaciones del teléfono sin revisar: la campana de la barra de arriba (con el número en rojo) y
 * «Notificaciones sin revisar» del inicio (Hoy y Mi viaje). Las dos leen lo mismo de la base.
 */
export function useMisNotificaciones() {
  const activo = useBaseTiene(VERSION_NOTIFICACIONES);
  return useQuery({
    queryKey: ['usuarios', 'notificaciones'] as const,
    queryFn: async (): Promise<MisNotificaciones> => {
      const { data, error } = await browserDb().schema('ops').rpc('fn_mis_notificaciones', { p_limite: 30 });
      if (error) throw error;
      return parsearNotificaciones(data);
    },
    enabled: activo,
    refetchInterval: activo ? 60_000 : false,
  });
}

/** Saca de la bandeja del teléfono las que ya se abrieron en el sistema (en Android así baja el número del ícono). */
async function cerrarEnElTelefono(ids: number[] | 'todas') {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    for (const n of (await reg?.getNotifications()) ?? []) {
      const id = (n.data as { id?: unknown } | null)?.id;
      if (typeof id === 'number' && (ids === 'todas' || ids.includes(id))) n.close();
    }
  } catch {
    // El navegador no lo permite: queda en la bandeja hasta que se toque o se descarte
  }
}

/** Abrir una (queda vista y lleva a su pantalla) o marcar todas como vistas. */
function useAcciones() {
  const qc = useQueryClient();
  const router = useRouter();
  const [marcando, setMarcando] = useState(false);
  const abrir = async (n: Notificacion) => {
    void cerrarEnElTelefono([n.id]);
    const r = await marcarNotificacionVista(n.id);
    if (r.ok) void invalidar(qc, 'notificacion');
    router.push(n.url);
  };
  const marcarTodas = async () => {
    setMarcando(true);
    const r = await marcarNotificacionesVistas();
    setMarcando(false);
    if (r.ok) {
      void cerrarEnElTelefono('todas');
      void invalidar(qc, 'notificacion');
    }
  };
  return { abrir, marcarTodas, marcando };
}

/**
 * Mantiene al día el teléfono: el número rojo del ícono de la app (iPhone con la app instalada y Chrome o Edge de
 * computadora) y la lista cuando llega una notificación o se toca una (aviso del service worker).
 */
function useSincronizarTelefono(pendientes: number | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (pendientes === undefined || typeof navigator === 'undefined' || !('setAppBadge' in navigator)) return;
    (pendientes > 0 ? navigator.setAppBadge(pendientes) : navigator.clearAppBadge()).catch(() => undefined);
  }, [pendientes]);
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const alAvisar = (e: MessageEvent) => {
      if ((e.data as { tipo?: unknown } | null)?.tipo === 'notificaciones') void invalidar(qc, 'notificacion');
    };
    navigator.serviceWorker.addEventListener('message', alAvisar);
    // Que el teléfono tome enseguida el service worker nuevo (el del número en el ícono)
    navigator.serviceWorker
      .getRegistration('/')
      .then((reg) => reg?.update())
      .catch(() => undefined);
    return () => navigator.serviceWorker.removeEventListener('message', alAvisar);
  }, [qc]);
}

function Renglon({ n, alAbrir }: { n: Notificacion; alAbrir: (n: Notificacion) => void }) {
  const { zonaHoraria } = useSesion();
  return (
    <li>
      <button type="button" onClick={() => alAbrir(n)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-hover">
        <span className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', n.urgente ? 'bg-error' : 'bg-marca')} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-tinta">{n.titulo}</span>
          {n.cuerpo && n.cuerpo !== n.titulo && <span className="block text-sm text-tinta-suave">{n.cuerpo}</span>}
          {n.creadaEn && <span className="mt-0.5 block text-xs text-tinta-suave">{formatearFechaHora(n.creadaEn, zonaHoraria)}</span>}
        </span>
        <ChevronRight className="mt-0.5 size-4 shrink-0 text-tinta-suave" />
      </button>
    </li>
  );
}

function Lista({ d, alAbrir }: { d: MisNotificaciones; alAbrir: (n: Notificacion) => void }) {
  return (
    <>
      <ul className="divide-y divide-borde">
        {d.lista.map((n) => (
          <Renglon key={n.id} n={n} alAbrir={alAbrir} />
        ))}
      </ul>
      {d.pendientes > d.lista.length && <p className="px-4 py-2 text-xs text-tinta-suave">Y {d.pendientes - d.lista.length} más, más viejas.</p>}
    </>
  );
}

function BotonMarcarTodas({ onClick, marcando }: { onClick: () => void; marcando: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={marcando} className="inline-flex items-center gap-1 text-xs font-medium text-marca hover:underline disabled:opacity-60">
      <CheckCheck className="size-4" /> Marcar todas como vistas
    </button>
  );
}

/** La campana de la barra de arriba: el número rojo de las que no se abrieron y, al tocarla, la lista. */
export function CampanaNotificaciones() {
  const { data } = useMisNotificaciones();
  useSincronizarTelefono(data?.pendientes);
  const { abrir, marcarTodas, marcando } = useAcciones();
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

  if (!data) return null;
  const n = data.pendientes;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-label={n > 0 ? textoPendientes(n) : 'Notificaciones'}
        title={n > 0 ? textoPendientes(n) : 'No tenés notificaciones sin revisar'}
        className="relative rounded-md p-1.5 text-tinta-suave hover:bg-hover"
      >
        <Bell className="size-5" />
        {n > 0 && (
          <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-error px-1 text-[11px] font-bold leading-none text-white tabular-nums">
            {numeroInsignia(n)}
          </span>
        )}
      </button>
      {abierto && (
        <div
          role="dialog"
          aria-label="Notificaciones sin revisar"
          className="fixed inset-x-3 top-16 z-30 overflow-hidden rounded-lg border border-borde bg-panel shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-borde px-4 py-2.5">
            <p className="text-sm font-semibold text-tinta">Notificaciones sin revisar</p>
            {n > 0 && <BotonMarcarTodas onClick={() => void marcarTodas()} marcando={marcando} />}
          </div>
          {n === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-tinta-suave">No tenés notificaciones sin revisar.</p>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto">
              <Lista
                d={data}
                alAbrir={(x) => {
                  setAbierto(false);
                  void abrir(x);
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** «Notificaciones sin revisar» arriba del inicio (Hoy y Mi viaje). Si no hay ninguna, no se muestra. */
export function NotificacionesSinRevisar() {
  const { data } = useMisNotificaciones();
  const { abrir, marcarTodas, marcando } = useAcciones();
  if (!data || data.pendientes === 0) return null;
  return (
    <section id="notificaciones" aria-label="Notificaciones sin revisar" className={cn(TARJETA, 'overflow-hidden border-error/40')}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-borde px-4 py-3">
        <h2 className="flex items-center gap-2 font-medium text-tinta">
          <BellRing className="size-5 text-error" /> Notificaciones sin revisar
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-error px-1.5 text-xs font-bold text-white tabular-nums">
            {numeroInsignia(data.pendientes)}
          </span>
        </h2>
        <BotonMarcarTodas onClick={() => void marcarTodas()} marcando={marcando} />
      </div>
      <Lista d={data} alAbrir={(x) => void abrir(x)} />
    </section>
  );
}
