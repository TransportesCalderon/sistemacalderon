'use client';

import { useEffect, useRef, useState } from 'react';
import { LocateFixed, LocateOff, MapPinned } from 'lucide-react';
import { leerLocal, guardarLocal } from '@/shared/lib/local';
import { cn } from '@/shared/lib/cn';
import { BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import { useEnviarPosicion } from '../queries/hooks';

const CLAVE = 'tc.chofer.compartir';

type Estado = 'apagado' | 'esperando' | 'activo' | 'sin_permiso' | 'sin_gps';

/**
 * Comparte la ubicación del celular mientras el chofer tiene una carga asignada (la base
 * no guarda nada sin carga). Con una página web el navegador solo la da con la aplicación
 * abierta: se pide que la pantalla no se apague mientras está activo.
 */
export function CompartirUbicacion({ habilitado, intervaloS }: { habilitado: boolean; intervaloS: number }) {
  const enviar = useEnviarPosicion();
  const [quiere, setQuiere] = useState(true);
  const [estado, setEstado] = useState<Estado>('apagado');
  const [ultima, setUltima] = useState<Date | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const posicion = useRef<GeolocationPosition | null>(null);
  const enviarRef = useRef(enviar.mutateAsync);
  enviarRef.current = enviar.mutateAsync;

  useEffect(() => setQuiere(leerLocal<boolean>(CLAVE, true)), []);

  useEffect(() => {
    if (!habilitado || !quiere) {
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
        setUltima(new Date());
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
  }, [habilitado, quiere, intervaloS]);

  const alternar = () => {
    const v = !quiere;
    setQuiere(v);
    guardarLocal(CLAVE, v);
  };

  if (!habilitado) {
    return (
      <div className={cn(TARJETA, 'flex items-start gap-3 p-4 text-sm text-tinta-suave')}>
        <LocateOff className="mt-0.5 size-5 shrink-0" />
        <p>Sin carga asignada no se comparte tu ubicación.</p>
      </div>
    );
  }

  const textos: Record<Estado, string> = {
    apagado: 'No estás compartiendo tu ubicación. Logística no puede seguir la carga.',
    esperando: 'Buscando la señal del GPS…',
    activo: ultima
      ? `Compartiendo tu ubicación. Última enviada: ${ultima.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}.`
      : 'Compartiendo tu ubicación.',
    sin_permiso: 'El celular no da permiso de ubicación a la aplicación. Activalo en los ajustes del navegador para este sitio.',
    sin_gps: 'Este celular o navegador no tiene GPS disponible.',
  };

  return (
    <div className={cn(TARJETA, 'space-y-2 p-4', estado === 'activo' ? 'border-exito/40' : estado === 'apagado' ? '' : 'border-alerta/40')}>
      <div className="flex items-start gap-3">
        {estado === 'activo' ? <LocateFixed className="mt-0.5 size-5 shrink-0 text-exito" /> : <MapPinned className="mt-0.5 size-5 shrink-0 text-alerta" />}
        <div className="flex-1 space-y-1 text-sm">
          <p className="font-medium text-tinta">{textos[estado]}</p>
          <p className="text-tinta-suave">
            Solo mientras tenés una carga y la aplicación está abierta. Dejá esta pantalla abierta durante el viaje; si cerrás la aplicación o se
            bloquea el celular, deja de enviarse.
          </p>
          {aviso && <p className="text-alerta">{aviso}</p>}
        </div>
      </div>
      <button type="button" className={BOTON_SECUNDARIO} onClick={alternar}>
        {quiere ? 'Dejar de compartir' : 'Compartir mi ubicación'}
      </button>
    </div>
  );
}
