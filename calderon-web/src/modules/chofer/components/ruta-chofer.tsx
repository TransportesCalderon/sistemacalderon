'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, LocateFixed, Navigation, TriangleAlert } from 'lucide-react';
import { linkDesde, siguientePunto, type RutaChofer } from '@/modules/logistica/domain/rutas';
import { cn } from '@/shared/lib/cn';

type Pos = { lat: number; lng: number };

/**
 * Migración 135: la ruta del chofer para Google Maps. El botón abre Google Maps desde donde está
 * el chofer, con las paradas que le faltan (si cerró Google Maps, vuelve a tocar el mismo botón).
 */
export function RutaDelChofer({ ruta }: { ruta: RutaChofer }) {
  const [pos, setPos] = useState<Pos | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [sinUbicacion, setSinUbicacion] = useState(false);
  const [verParadas, setVerParadas] = useState(false);

  const ubicar = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return setSinUbicacion(true);
    setBuscando(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude });
        setSinUbicacion(false);
        setBuscando(false);
      },
      () => {
        setSinUbicacion(true);
        setBuscando(false);
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 120_000 },
    );
  }, []);

  // Si el teléfono ya dio permiso (comparte la ubicación del viaje), se ubica solo
  useEffect(() => {
    let vivo = true;
    void navigator.permissions
      ?.query({ name: 'geolocation' as PermissionName })
      .then((r) => {
        if (vivo && r.state === 'granted') ubicar();
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [ubicar]);

  const desde = siguientePunto(ruta.puntos, pos);
  const link = linkDesde(ruta.puntos, desde);
  if (!link) return null;

  return (
    <section className="space-y-3 rounded-lg border border-marca/40 bg-marca-suave/40 p-3">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-tinta">
          <Navigation className="size-4 text-marca" /> Tu ruta · {ruta.nombre}
        </h3>
        <p className="text-xs text-tinta-suave">Seguí esta ruta: está pensada para el camión (altura, tránsito pesado y tipo de carga).</p>
      </div>
      {ruta.notas && (
        <p className="flex gap-2 rounded-md bg-alerta-suave px-3 py-2 text-sm text-alerta">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {ruta.notas}
        </p>
      )}

      <a
        href={link.url}
        target="_blank"
        rel="noreferrer"
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-marca px-4 py-4 text-base font-semibold text-white shadow-sm active:opacity-90"
      >
        <Navigation className="size-5" /> Abrir la ruta en Google Maps
      </a>
      <p className="text-xs text-tinta-suave">
        {pos
          ? `Sale desde donde estás, hacia «${ruta.puntos[desde]?.nombre ?? ''}»${link.paradas > 0 ? ` y ${link.paradas} parada(s) más` : ''}.`
          : 'Sale desde donde estás, con todas las paradas.'}{' '}
        Si cerraste Google Maps, volvé acá y tocá el botón de nuevo: sigue desde donde estés.
      </p>
      {!link.tramoFinal && (
        <p className="rounded-md bg-panel px-3 py-2 text-xs text-tinta">
          La ruta es larga: este tramo llega hasta «{link.hasta.nombre}». Al llegar, volvé y tocá el botón otra vez.
        </p>
      )}
      {!pos && (
        <button type="button" onClick={ubicar} disabled={buscando} className="inline-flex items-center gap-1.5 text-sm font-medium text-marca disabled:opacity-60">
          <LocateFixed className={cn('size-4', buscando && 'animate-pulse')} /> {buscando ? 'Buscando dónde estás…' : 'Usar mi ubicación para saltear las paradas que ya pasé'}
        </button>
      )}
      {sinUbicacion && <p className="text-xs text-error">No se pudo saber dónde estás: permití la ubicación o elegí desde qué parada seguir.</p>}

      <button type="button" onClick={() => setVerParadas((v) => !v)} className="flex items-center gap-1 text-sm text-tinta-suave">
        <ChevronDown className={cn('size-4 transition-transform', verParadas && 'rotate-180')} /> {verParadas ? 'Ocultar' : 'Ver'} las paradas ({ruta.puntos.length})
      </button>
      {verParadas && (
        <ol className="space-y-1">
          {ruta.puntos.map((p, i) => {
            const pasada = pos !== null && i < desde;
            const l = i > 0 ? linkDesde(ruta.puntos, i) : null;
            return (
              <li key={i} className={cn('flex items-center gap-2 rounded-md bg-panel px-2 py-1.5 text-sm', pasada && 'text-tinta-suave line-through')}>
                <span className="w-5 text-right text-xs font-semibold tabular-nums">{i + 1}</span>
                <span className="flex-1">{p.nombre}</span>
                {l && (
                  <a href={l.url} target="_blank" rel="noreferrer" className="text-xs font-medium text-marca no-underline">
                    Seguir desde acá
                  </a>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
