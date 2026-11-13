'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BellOff, BellRing, LoaderCircle, Send } from 'lucide-react';
import { browserDb } from '@/shared/supabase/browser';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from '@/shared/ui/clases';
import { clavePushPublica, desuscribirPush, probarPush, suscribirPush } from './push.actions';

/** Migración 238 · Alertas en el teléfono. */

type Soporte = 'si' | 'instalar_iphone' | 'no';

function soporte(): Soporte {
  if (typeof window === 'undefined') return 'no';
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const instalada = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  if (ios && !instalada) return 'instalar_iphone';
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window ? 'si' : 'no';
}

function claveABytes(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function suscripcionActual(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration('/');
  return reg ? reg.pushManager.getSubscription() : null;
}

/**
 * Cada persona activa las alertas en su teléfono. Le llegan las mismas ventanas emergentes importantes que ve en el
 * sistema (fuera de ruta, tanque bajo, escalamientos, órdenes de trabajo): la base decide cuáles.
 */
export function AlertasTelefono() {
  const [sop, setSop] = useState<Soporte | null>(null);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const estado = useQuery({
    queryKey: ['usuarios', 'push', 'estado'] as const,
    queryFn: async () => {
      const { data, error } = await browserDb().schema('ops').rpc('fn_push_estado');
      if (error) throw error;
      const d = (data ?? {}) as { endpoints?: string[] };
      return { endpoints: Array.isArray(d.endpoints) ? d.endpoints : [] };
    },
  });

  useEffect(() => {
    const s = soporte();
    setSop(s);
    if (s === 'si') void suscripcionActual().then((x) => setEndpoint(x?.endpoint ?? null));
  }, []);

  if (sop === null) return null;
  const activa = endpoint !== null && (estado.data?.endpoints ?? []).includes(endpoint);
  const bloqueadas = sop === 'si' && Notification.permission === 'denied';

  const activar = async () => {
    setOcupado(true);
    setMsg(null);
    try {
      // Primero el permiso (el iPhone lo exige dentro del toque)
      const permiso = await Notification.requestPermission();
      if (permiso !== 'granted') {
        setMsg({ ok: false, texto: 'No diste permiso para las notificaciones. Se habilita en los ajustes del teléfono.' });
        return;
      }
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      const clave = await clavePushPublica();
      if (!clave.ok) {
        setMsg({ ok: false, texto: clave.error.mensaje });
        return;
      }
      const vieja = await reg.pushManager.getSubscription();
      if (vieja) await vieja.unsubscribe();
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveABytes(clave.data) });
      const j = sub.toJSON();
      const r = await suscribirPush({
        endpoint: sub.endpoint,
        p256dh: j.keys?.p256dh ?? '',
        auth: j.keys?.auth ?? '',
        dispositivo: navigator.userAgent.slice(0, 200),
      });
      if (!r.ok) {
        await sub.unsubscribe();
        setMsg({ ok: false, texto: r.error.mensaje });
        return;
      }
      setEndpoint(sub.endpoint);
      setMsg({ ok: true, texto: 'Listo. En un minuto te llega una alerta de prueba.' });
      await estado.refetch();
    } catch (e) {
      setMsg({ ok: false, texto: `No se pudo activar: ${e instanceof Error ? e.message : 'error del navegador'}` });
    } finally {
      setOcupado(false);
    }
  };

  const desactivar = async () => {
    setOcupado(true);
    setMsg(null);
    const sub = await suscripcionActual();
    if (sub) {
      const r = await desuscribirPush(sub.endpoint);
      if (!r.ok) setMsg({ ok: false, texto: r.error.mensaje });
      await sub.unsubscribe();
    }
    setEndpoint(null);
    await estado.refetch();
    setOcupado(false);
  };

  return (
    <section className="space-y-3 rounded-xl border border-borde bg-panel p-6">
      <h2 className="font-medium text-tinta">Alertas en este teléfono</h2>
      <p className="text-sm text-tinta-suave">
        Te llegan como notificación los avisos importantes que ves en el sistema: camión fuera de la ruta, tanque bajo, alertas vencidas y órdenes
        de trabajo (por ejemplo, «en la base ahora»). Cada aviso llega una vez.
      </p>
      {sop === 'instalar_iphone' && (
        <p className="rounded-lg bg-borde/30 p-3 text-sm text-tinta">
          En iPhone, primero instalá la aplicación: en Safari tocá <b>Compartir</b> › <b>Agregar a pantalla de inicio</b>. Después abrí IronTrack
          desde ese ícono, entrá a Mi perfil y activá las alertas.
        </p>
      )}
      {sop === 'no' && <p className="text-sm text-tinta-suave">Este navegador no puede recibir alertas. En Android usá Chrome.</p>}
      {bloqueadas && (
        <p className="text-sm text-error">Las notificaciones están bloqueadas para este sitio. Habilitalas en los ajustes del navegador o del teléfono.</p>
      )}
      {sop === 'si' && !bloqueadas && (
        <div className="flex flex-wrap gap-2">
          {activa ? (
            <>
              <span className="inline-flex items-center gap-1 text-sm font-medium text-exito">
                <BellRing className="size-4" /> Activadas en este teléfono
              </span>
              <button
                type="button"
                className={BOTON_SECUNDARIO}
                disabled={ocupado}
                onClick={async () => {
                  setOcupado(true);
                  const r = await probarPush();
                  setOcupado(false);
                  setMsg(r.ok ? { ok: true, texto: 'En un minuto te llega la prueba.' } : { ok: false, texto: r.error.mensaje });
                }}
              >
                <Send className="size-4" /> Probar
              </button>
              <button type="button" className={BOTON_SECUNDARIO} disabled={ocupado} onClick={desactivar}>
                <BellOff className="size-4" /> Desactivar
              </button>
            </>
          ) : (
            <button type="button" className={BOTON_PRIMARIO} disabled={ocupado || estado.isLoading} onClick={activar}>
              {ocupado ? <LoaderCircle className="size-4 animate-spin" /> : <BellRing className="size-4" />} Activar en este teléfono
            </button>
          )}
        </div>
      )}
      {msg && <p className={msg.ok ? 'text-sm text-exito' : 'text-sm text-error'}>{msg.texto}</p>}
    </section>
  );
}
