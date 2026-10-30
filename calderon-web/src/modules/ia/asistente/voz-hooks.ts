'use client';

/**
 * Chat por voz con Iris: escuchar (micrófono → texto) y hablar (texto → voz femenina del dispositivo).
 * Todo lo hace el navegador: no sale audio hacia ningún servicio nuevo ni hay claves.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { elegirVoz, textoParaLeer, trozosParaLeer } from './voz';

// ---------------------------------------------------------------------------------------------
// Hablar
// ---------------------------------------------------------------------------------------------
export function useHablar() {
  const [disponible, setDisponible] = useState(false);
  const [hablando, setHablando] = useState<number | null>(null);
  const voz = useRef<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const s = window.speechSynthesis;
    const cargar = () => {
      voz.current = elegirVoz(s.getVoices());
      setDisponible(true);
    };
    cargar();
    s.addEventListener('voiceschanged', cargar);
    return () => {
      s.removeEventListener('voiceschanged', cargar);
      s.cancel();
    };
  }, []);

  const callar = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    setHablando(null);
  }, []);

  /** Lee una respuesta (Markdown) en voz alta; `id` marca cuál se está leyendo. */
  const hablar = useCallback((id: number, markdown: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const s = window.speechSynthesis;
    s.cancel();
    const partes = trozosParaLeer(textoParaLeer(markdown));
    if (partes.length === 0) return;
    setHablando(id);
    partes.forEach((p, i) => {
      const u = new SpeechSynthesisUtterance(p);
      if (voz.current) u.voice = voz.current;
      u.lang = voz.current?.lang ?? 'es-AR';
      u.rate = 1.05;
      u.pitch = 1.1; // un poco más aguda: suena más joven
      if (i === partes.length - 1) {
        u.onend = () => setHablando((h) => (h === id ? null : h));
        u.onerror = () => setHablando((h) => (h === id ? null : h));
      }
      s.speak(u);
    });
  }, []);

  /** iPhone solo deja hablar si antes hubo un toque: se llama al tocar el micrófono. */
  const desbloquear = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    window.speechSynthesis.speak(u);
  }, []);

  return { disponible, hablando, hablar, callar, desbloquear };
}

// ---------------------------------------------------------------------------------------------
// Escuchar
// ---------------------------------------------------------------------------------------------
interface ResultadoVoz {
  isFinal: boolean;
  0: { transcript: string };
}
interface Reconocedor {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ResultadoVoz> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type ConstructorReconocedor = new () => Reconocedor;

function constructorReconocedor(): ConstructorReconocedor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: ConstructorReconocedor; webkitSpeechRecognition?: ConstructorReconocedor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const ERRORES: Record<string, string> = {
  'not-allowed': 'No tengo permiso para usar el micrófono: habilitalo en el navegador.',
  'service-not-allowed': 'No tengo permiso para usar el micrófono: habilitalo en el navegador.',
  'audio-capture': 'No encuentro el micrófono.',
  network: 'Para dictar hace falta conexión a internet.',
};

/** Dictado: mientras hablás muestra el texto; al terminar llama a `alTerminar` con lo dicho. */
export function useEscuchar(alTerminar: (texto: string) => void) {
  const [disponible, setDisponible] = useState(false);
  const [escuchando, setEscuchando] = useState(false);
  const [parcial, setParcial] = useState('');
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Reconocedor | null>(null);
  const terminar = useRef(alTerminar);
  terminar.current = alTerminar;

  useEffect(() => {
    setDisponible(!!constructorReconocedor());
    return () => rec.current?.abort();
  }, []);

  const empezar = useCallback(() => {
    const C = constructorReconocedor();
    if (!C || rec.current) return;
    const r = new C();
    r.lang = 'es-AR';
    r.interimResults = true;
    r.continuous = false;
    r.maxAlternatives = 1;
    let dicho = '';
    r.onresult = (e) => {
      let fin = '';
      let medio = '';
      for (let i = 0; i < e.results.length; i++) {
        const x = e.results[i];
        if (!x) continue;
        if (x.isFinal) fin += x[0].transcript;
        else medio += x[0].transcript;
      }
      dicho = fin;
      setParcial((fin + medio).trim());
    };
    r.onerror = (e) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') setError(ERRORES[e.error] ?? 'No pude escucharte: probá de nuevo.');
    };
    r.onend = () => {
      rec.current = null;
      setEscuchando(false);
      setParcial('');
      const t = dicho.trim();
      if (t) terminar.current(t);
    };
    setError(null);
    setParcial('');
    rec.current = r;
    setEscuchando(true);
    try {
      r.start();
    } catch {
      rec.current = null;
      setEscuchando(false);
      setError('No pude usar el micrófono: probá de nuevo.');
    }
  }, []);

  /** Deja de escuchar y manda lo que se dijo hasta ahí. */
  const parar = useCallback(() => rec.current?.stop(), []);
  /** Corta sin mandar nada (al cerrar el panel). */
  const cancelar = useCallback(() => {
    const r = rec.current;
    if (!r) return;
    r.onend = () => {
      rec.current = null;
      setEscuchando(false);
      setParcial('');
    };
    r.abort();
  }, []);

  return { disponible, escuchando, parcial, error, empezar, parar, cancelar };
}
