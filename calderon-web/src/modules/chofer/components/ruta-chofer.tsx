'use client';

import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import { CheckCheck, Navigation, TriangleAlert } from 'lucide-react';
import { ErrorBase } from '@/modules/combustible/components/comun/ui';
import { llegueDestino, llegueMiDestino } from '@/modules/logistica/actions/rutas.actions';
import type { ErrorAccion } from '@/server/actions/result';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { useInvalidar } from '@/shared/query/invalidar';
import { linkDesde, siguientePunto, type PuntoRuta } from '@/modules/logistica/domain/rutas';
import { cn } from '@/shared/lib/cn';

type Pos = { lat: number; lng: number };

/**
 * Migración 135: la ruta del chofer para Google Maps. El botón abre Google Maps desde donde está
 * el chofer, con las paradas que le faltan (si cerró Google Maps, vuelve a tocar el mismo botón).
 */
/** Lo que necesita para mostrarse: la de una carga (158) o la ruta en curso del chofer (161). */
export interface RutaParaChofer {
  nombre: string;
  notas: string | null;
  puntos: PuntoRuta[];
}

/**
 * La ruta en curso del chofer (cargada por Telemetría). Un solo botón: «Continuar viaje». El sistema
 * ve dónde está el chofer y abre Google Maps desde ahí, con las paradas que le faltan (no se muestran).
 */
export function RutaDelChofer({ ruta, servicioId = null }: { ruta: RutaParaChofer; servicioId?: number | null }) {
  const [pos, setPos] = useState<Pos | null>(null);

  const ubicar = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => undefined,
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 120_000 },
    );
  }, []);

  // Se ubica solo al abrir y cada minuto (el chofer ya comparte la ubicación del viaje)
  useEffect(() => {
    ubicar();
    const t = setInterval(ubicar, 60_000);
    return () => clearInterval(t);
  }, [ubicar]);

  const [buscando, setBuscando] = useState(false);
  const link = linkDesde(ruta.puntos, siguientePunto(ruta.puntos, pos));
  if (!link) return null;

  /** Al tocar: la posición de ESTE momento, y Google Maps desde ahí hasta el último punto. */
  const continuar = (e: MouseEvent<HTMLAnchorElement>) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return; // sigue el link con la última posición
    e.preventDefault();
    setBuscando(true);
    const abrir = (p: Pos | null) => {
      setBuscando(false);
      if (p) setPos(p);
      const l = linkDesde(ruta.puntos, siguientePunto(ruta.puntos, p ?? pos)) ?? link;
      window.location.assign(l.url);
    };
    navigator.geolocation.getCurrentPosition(
      (g) => abrir({ lat: g.coords.latitude, lng: g.coords.longitude }),
      () => abrir(null),
      { enableHighAccuracy: true, timeout: 5_000, maximumAge: 0 },
    );
  };

  return (
    <section className="space-y-3 rounded-lg border border-marca/40 bg-marca-suave/40 p-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-tinta">
        <Navigation className="size-4 text-marca" /> Tu ruta · {ruta.nombre}
      </h3>
      {ruta.notas && (
        <p className="flex gap-2 rounded-md bg-alerta-suave px-3 py-2 text-sm text-alerta">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {ruta.notas}
        </p>
      )}

      <a
        href={link.url}
        target="_blank"
        rel="noreferrer"
        onClick={continuar}
        aria-busy={buscando}
        className={cn(
          'flex w-full items-center justify-center gap-2 rounded-xl bg-marca px-4 py-4 text-base font-semibold text-white shadow-sm active:opacity-90',
          buscando && 'opacity-70',
        )}
      >
        <Navigation className="size-5" /> {buscando ? 'Buscando dónde estás…' : 'Continuar viaje'}
      </a>
      <p className="text-xs text-tinta-suave">Te lleva desde donde estás hasta el final de la ruta. Si se cerró Google Maps, tocá «Continuar viaje» de nuevo.</p>

      {/* Migración 158: al llegar al destino (también lo detecta el GPS). El chofer no ve si hay otras rutas cargadas. */}
      <LlegueAlDestino servicioId={servicioId} />
    </section>
  );
}

function LlegueAlDestino({ servicioId }: { servicioId: number | null }) {
  const hay = useBaseTiene(158);
  const porChofer = useBaseTiene(161);
  const conUbicacion = useBaseTiene(177);
  const invalidar = useInvalidar();
  const [confirmar, setConfirmar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<ErrorAccion | null>(null);
  if (!hay || (!porChofer && servicioId === null)) return null;
  const enviar = async () => {
    setError(null);
    setOcupado(true);
    // Migración 177: la base controla que esté en el destino (GPS del camión o, si no manda, el celular)
    const pos = conUbicacion ? await ubicacionCelular() : null;
    const r = porChofer || servicioId === null ? await llegueMiDestino(pos ?? {}) : await llegueDestino({ servicioId });
    setOcupado(false);
    if (!r.ok) return setError(r.error);
    setConfirmar(false);
    await invalidar('chofer_portal');
  };
  return (
    <div className="space-y-2">
      {confirmar ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-panel px-3 py-2 text-sm">
          <span className="flex-1">¿Llegaste al destino?</span>
          <button type="button" disabled={ocupado} onClick={() => void enviar()} className="rounded-md bg-marca px-3 py-1.5 font-medium text-white disabled:opacity-60">
            Sí, llegué
          </button>
          <button type="button" onClick={() => setConfirmar(false)} className="px-2 py-1.5 text-tinta-suave">
            No
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmar(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-marca bg-panel px-4 py-3 text-sm font-semibold text-marca"
        >
          <CheckCheck className="size-4" /> Llegué al destino
        </button>
      )}
      <ErrorBase error={error} />
    </div>
  );
}

/** La ubicación del celular para «Llegué a destino» (null si no la da o tarda). */
function ubicacionCelular(): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((ok) =>
    navigator.geolocation.getCurrentPosition(
      (g) => ok({ lat: g.coords.latitude, lng: g.coords.longitude }),
      () => ok(null),
      { enableHighAccuracy: true, timeout: 8_000, maximumAge: 60_000 },
    ),
  );
}
