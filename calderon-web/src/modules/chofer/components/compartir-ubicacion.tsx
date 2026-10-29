'use client';

import { useEffect, useRef, useState } from 'react';
import { leerLocal, guardarLocal } from '@/shared/lib/local';
import { cn } from '@/shared/lib/cn';
import { TARJETA } from '@/shared/ui/clases';
import { useEnviarPosicion } from '../queries/hooks';

const CLAVE = 'tc.chofer.aviso_ubicacion';

type Estado = 'apagado' | 'esperando' | 'activo' | 'sin_permiso' | 'sin_gps';

/**
 * Comparte la ubicación del celular mientras el chofer tiene una carga asignada (la base
 * no guarda nada sin carga). Con una página web el navegador solo la da con la aplicación
 * abierta: se pide que la pantalla no se apague mientras está activo.
 * Pedido de Gerencia (30/10/2026): discreto. Un aviso corto al empezar cada viaje y nada más
 * (salvo que el navegador no dé permiso). El chofer queda informado del seguimiento.
 */
export function CompartirUbicacion({ habilitado, intervaloS, viaje }: { habilitado: boolean; intervaloS: number; viaje: string }) {
  const enviar = useEnviarPosicion();
  const [visto, setVisto] = useState(true);
  const [estado, setEstado] = useState<Estado>('apagado');
  const [aviso, setAviso] = useState<string | null>(null);
  const posicion = useRef<GeolocationPosition | null>(null);
  const enviarRef = useRef(enviar.mutateAsync);
  enviarRef.current = enviar.mutateAsync;

  // El aviso se muestra una sola vez por viaje (las cargas asignadas)
  useEffect(() => setVisto(leerLocal<string>(CLAVE, '') === viaje), [viaje]);

  useEffect(() => {
    if (!habilitado) {
      setEstado('apagado');
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setEstado('sin_gps');
      return;
    }
    setEstado('esperando');
    let enviadaPrimera = false;
    let cerrado = false;
    let bloqueo: { release: () => Promise<void> } | null = null;

    const mandar = async () => {
      const p = posicion.current;
      if (!p || cerrado) return;
      const r = await enviarRef.current({
        latitud: p.coords.latitude,
        longitud: p.coords.longitude,
        precisionM: p.coords.accuracy ?? null,
        velocidadKmh: p.coords.speed !== null && p.coords.speed >= 0 ? Math.round(p.coords.speed * 3.6) : null,
        rumbo: p.coords.heading !== null && !Number.isNaN(p.coords.heading) ? p.coords.heading : null,
        ts: new Date(p.timestamp).toISOString(),
      });
      if (r.ok && r.data.guardada) {
        setAviso(null);
      } else if (r.ok && r.data.motivo && r.data.motivo !== 'Demasiado seguido') {
        setAviso(r.data.motivo);
      } else if (!r.ok) {
        setAviso(r.error.mensaje);
      }
    };

    const id = navigator.geolocation.watchPosition(
      (p) => {
        posicion.current = p;
        setEstado('activo');
        if (!enviadaPrimera) {
          enviadaPrimera = true;
          void mandar();
        }
      },
      (e) => setEstado(e.code === e.PERMISSION_DENIED ? 'sin_permiso' : 'esperando'),
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 60_000 },
    );
    const reloj = window.setInterval(() => void mandar(), intervaloS * 1000);

    // Que la pantalla no se apague mientras comparte (si el navegador lo permite)
    const pedirBloqueo = async () => {
      try {
        const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock;
        if (wl && document.visibilityState === 'visible') bloqueo = await wl.request('screen');
      } catch {
        bloqueo = null;
      }
    };
    const alVolver = () => {
      if (document.visibilityState === 'visible') {
        void pedirBloqueo();
        void mandar();
      }
    };
    void pedirBloqueo();
    document.addEventListener('visibilitychange', alVolver);

    return () => {
      cerrado = true;
      navigator.geolocation.clearWatch(id);
      window.clearInterval(reloj);
      document.removeEventListener('visibilitychange', alVolver);
      void bloqueo?.release().catch(() => undefined);
    };
  }, [habilitado, intervaloS]);

  if (!habilitado) return null;

  // Solo al empezar el viaje: un aviso corto que se cierra. Después nada, salvo que falte el permiso.
  if (!visto) {
    return (
      <div className={cn(TARJETA, 'flex items-center gap-3 p-3 text-sm text-tinta-suave')}>
        <p className="flex-1">Durante el viaje, la aplicación comparte la ubicación del celular con Logística.</p>
        <button
          type="button"
          className="text-sm font-medium text-marca hover:underline"
          onClick={() => {
            guardarLocal(CLAVE, viaje);
            setVisto(true);
          }}
        >
          Entendido
        </button>
      </div>
    );
  }
  if (estado === 'sin_permiso') {
    return <p className="text-xs text-tinta-suave">Para seguir la carga, activá la ubicación de este sitio en los ajustes del navegador.</p>;
  }
  return aviso ? <p className="text-xs text-tinta-suave">{aviso}</p> : null;
}
