'use client';

import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { LoaderCircle, MessageSquarePlus, Send, Sparkles, ThumbsDown, ThumbsUp, TriangleAlert, X } from 'lucide-react';
import { useCan } from '@/modules/core/permissions/can';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { cn } from '@/shared/lib/cn';
import { browserDb } from '@/shared/supabase/browser';
import { asistenteRepository, textoPeriodo, VERSION_ASISTENTE, type Turno } from './asistente';
import { preguntarAsistente, valorarRespuesta } from './asistente.actions';
import { parsearMarkdown, type Bloque, type Trozo } from './markdown';

const espera = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const repo = () => asistenteRepository(browserDb());

/**
 * IA-3 · Botón «Preguntale» en la barra de arriba y su panel a la derecha (como las fichas: la
 * pantalla de atrás no se pierde). Primero las preguntas sugeridas; abajo, el cuadro para escribir.
 * Lo ve quien la base deja usar el asistente (Gerencia y los usuarios de prueba).
 */
export function BotonAsistente() {
  const hayBase = useBaseTiene(VERSION_ASISTENTE);
  const permitido = useCan('ia.asistente:editar');
  const estado = useQuery({
    queryKey: ['ia', 'asistente', 'estado'],
    queryFn: () => repo().estado(),
    enabled: hayBase && permitido,
    staleTime: 60_000,
  });
  const [abierto, setAbierto] = useState(false);
  if (!hayBase || !permitido || !estado.data?.puede) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
        className={cn(
          'flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm',
          abierto ? 'bg-marca-suave font-medium text-marca' : 'text-tinta-suave hover:bg-hover hover:text-tinta',
        )}
        title="Preguntale al asistente de IA"
      >
        <Sparkles className="size-4" />
        <span className="hidden sm:inline">Preguntale</span>
      </button>
      {/* Fuera de la barra (su desenfoque encierra a los elementos fijos): directo en el body */}
      {abierto && createPortal(<PanelAsistente onCerrar={() => setAbierto(false)} onCambio={() => void estado.refetch()} />, document.body)}
    </>
  );
}

function PanelAsistente({ onCerrar, onCambio }: { onCerrar: () => void; onCambio: () => void }) {
  const { data: est } = useQuery({ queryKey: ['ia', 'asistente', 'estado'], queryFn: () => repo().estado(), staleTime: 60_000 });
  const [conversacion, setConversacion] = useState<number | null>(null);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fondo = useRef<HTMLDivElement>(null);
  const avisarCambio = useRef(onCambio);
  avisarCambio.current = onCambio;
  const pensando = turnos.some((t) => t.estado === 'pensando');

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => e.key === 'Escape' && !e.defaultPrevented && onCerrar();
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onCerrar]);
  useEffect(() => {
    fondo.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turnos]);

  // Mientras la respuesta no está, se consulta cada segundo y medio (la base avanza en cada consulta)
  const pendiente = turnos.find((t) => t.estado === 'pensando')?.id ?? null;
  useEffect(() => {
    if (!pendiente) return;
    let cortar = false;
    void (async () => {
      for (let i = 0; i < 120 && !cortar; i++) {
        await espera(1500);
        if (cortar) return;
        try {
          const t = await repo().respuesta(pendiente);
          setTurnos((ts) => ts.map((x) => (x.id === t.id ? t : x)));
          if (t.estado !== 'pensando') {
            avisarCambio.current();
            return;
          }
        } catch (e) {
          setTurnos((ts) =>
            ts.map((x) => (x.id === pendiente ? { ...x, estado: 'error', error: e instanceof Error ? e.message : 'Se cortó la conexión' } : x)),
          );
          return;
        }
      }
      if (!cortar) setTurnos((ts) => ts.map((x) => (x.id === pendiente ? { ...x, estado: 'error', error: 'La IA no respondió a tiempo: probá de nuevo' } : x)));
    })();
    return () => {
      cortar = true;
    };
  }, [pendiente]);

  const preguntar = async (pregunta: string | null, sugerida: string | null, mostrar: string) => {
    setError(null);
    setEnviando(true);
    const r = await preguntarAsistente({ pregunta, conversacionId: conversacion, sugerida });
    setEnviando(false);
    if (!r.ok) {
      setError(r.error.mensaje);
      return;
    }
    const nuevo: Turno = {
      id: r.data,
      conversacionId: conversacion ?? 0,
      pregunta: mostrar,
      estado: 'pensando',
      leyendo: 'Pensando…',
      respuesta: null,
      error: null,
      avisos: [],
      fuentes: [],
      util: null,
    };
    setTurnos((ts) => [...ts, nuevo]);
    setTexto('');
    // La conversación la crea la base con la primera pregunta: se toma de la primera respuesta
    if (!conversacion) {
      try {
        const t = await repo().respuesta(r.data);
        setConversacion(t.conversacionId);
        setTurnos((ts) => ts.map((x) => (x.id === t.id ? t : x)));
      } catch {
        // la consulta de cada segundo y medio lo vuelve a intentar
      }
    }
  };

  const enviarTexto = () => {
    const p = texto.trim();
    if (p && !enviando && !pensando) void preguntar(p, null, p);
  };

  const nueva = () => {
    setConversacion(null);
    setTurnos([]);
    setError(null);
  };

  const apagado = est && (!est.activo || !est.conClave || !est.conPgNet);

  return (
    <aside
      role="dialog"
      aria-label="Asistente de IA"
      className="fixed bottom-0 right-0 top-14 z-[1050] flex w-full max-w-[540px] flex-col border-l border-borde bg-panel shadow-2xl"
    >
      <div className="flex items-center gap-2 border-b border-borde px-4 py-2">
        <Sparkles className="size-4 text-marca" />
        <p className="flex-1 font-semibold text-tinta">Preguntale</p>
        {turnos.length > 0 && (
          <button type="button" onClick={nueva} className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-tinta-suave hover:bg-hover">
            <MessageSquarePlus className="size-4" /> Nueva
          </button>
        )}
        <button type="button" onClick={onCerrar} aria-label="Cerrar el asistente" title="Cerrar (Esc)" className="rounded-md p-1.5 text-tinta-suave hover:bg-hover">
          <X className="size-5" />
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {apagado && (
          <p className="rounded-md bg-alerta-suave p-3 text-sm text-alerta">
            {!est.activo
              ? 'El asistente está apagado. TI lo prende con el parámetro ia.asistente_activo.'
              : !est.conClave
                ? 'Falta la clave anthropic_api_key en Vault: pedísela a TI.'
                : 'La base no tiene pg_net: la IA no puede llamar a la API.'}
          </p>
        )}
        {turnos.length === 0 && !apagado && (
          <div className="space-y-3">
            <p className="text-sm text-tinta-suave">
              Respondo con los números del sistema y te digo de dónde sale cada dato. Solo leo: no cambio nada.
            </p>
            <div className="grid gap-2">
              {(est?.sugeridas ?? []).map((s) => (
                <button
                  key={s.codigo}
                  type="button"
                  disabled={enviando}
                  onClick={() => void preguntar(null, s.codigo, s.pregunta)}
                  className="rounded-lg border border-borde px-4 py-3 text-left text-sm font-medium text-tinta hover:border-marca hover:bg-marca-suave disabled:opacity-60"
                >
                  {s.pregunta}
                </button>
              ))}
            </div>
          </div>
        )}
        {turnos.map((t) => (
          <TurnoVista key={t.id} t={t} onValorado={(util) => setTurnos((ts) => ts.map((x) => (x.id === t.id ? { ...x, util } : x)))} />
        ))}
        <div ref={fondo} />
      </div>

      <div className="space-y-1.5 border-t border-borde p-3">
        {error && <p className="text-sm text-error">{error}</p>}
        <div className="flex items-end gap-2">
          <textarea
            value={texto}
            rows={2}
            maxLength={2000}
            disabled={!!apagado}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                enviarTexto();
              }
            }}
            placeholder={turnos.length ? 'Repreguntá sobre esto («¿y el mes pasado?»)…' : 'Escribí tu pregunta…'}
            className="min-h-11 flex-1 resize-none rounded-md border border-borde bg-panel px-3 py-2 text-sm outline-none focus:border-marca"
          />
          <button
            type="button"
            onClick={enviarTexto}
            disabled={!texto.trim() || enviando || pensando || !!apagado}
            aria-label="Preguntar"
            className="grid size-11 place-items-center rounded-md bg-marca text-white hover:bg-marca/90 disabled:opacity-50"
          >
            {enviando ? <LoaderCircle className="size-5 animate-spin" /> : <Send className="size-5" />}
          </button>
        </div>
        {est && <p className="text-xs text-tinta-suave">Te quedan {est.quedanHoy} preguntas hoy.</p>}
      </div>
    </aside>
  );
}

function TurnoVista({ t, onValorado }: { t: Turno; onValorado: (util: boolean) => void }) {
  return (
    <div className="space-y-2">
      <p className="ml-auto w-fit max-w-[85%] rounded-lg bg-marca-suave px-3 py-2 text-sm text-tinta">{t.pregunta}</p>
      {t.estado === 'pensando' && (
        <p className="flex items-center gap-2 text-sm text-tinta-suave">
          <LoaderCircle className="size-4 animate-spin" /> {t.leyendo ?? 'Pensando…'}
        </p>
      )}
      {t.estado === 'error' && <p className="rounded-md bg-error/10 px-3 py-2 text-sm text-error">{t.error}</p>}
      {t.estado === 'lista' && (
        <div className="space-y-3">
          <Markdown texto={t.respuesta ?? ''} />
          {t.avisos.length > 0 && (
            <div className="space-y-1 rounded-md bg-alerta-suave p-2 text-sm text-alerta">
              {t.avisos.map((a) => (
                <p key={a} className="flex gap-1.5">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {a}
                </p>
              ))}
            </div>
          )}
          {t.fuentes.length > 0 && (
            <div className="text-xs text-tinta-suave">
              <span className="font-medium">De dónde sale: </span>
              {t.fuentes.map((f, i) => (
                <Fragment key={`${f.herramienta}-${i}`}>
                  {i > 0 && ' · '}
                  {f.pantalla ? (
                    <Link href={f.pantalla} className="text-marca hover:underline">
                      {f.etiqueta}
                    </Link>
                  ) : (
                    f.etiqueta
                  )}
                  {textoPeriodo(f.periodo) && ` (${textoPeriodo(f.periodo)})`}
                  {!f.ok && ' (no se pudo leer)'}
                </Fragment>
              ))}
            </div>
          )}
          <Valorar t={t} onValorado={onValorado} />
        </div>
      )}
    </div>
  );
}

/** 👍 útil / 👎 no útil (con comentario opcional en el 👎). */
function Valorar({ t, onValorado }: { t: Turno; onValorado: (util: boolean) => void }) {
  const [comentando, setComentando] = useState(false);
  const [comentario, setComentario] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mandar = async (util: boolean, texto: string | null) => {
    setOcupado(true);
    setError(null);
    const r = await valorarRespuesta({ turno: t.id, util, comentario: texto });
    setOcupado(false);
    if (!r.ok) return setError(r.error.mensaje);
    setComentando(false);
    onValorado(util);
  };
  if (t.util !== null) {
    return <p className="text-xs text-tinta-suave">{t.util ? '👍 Marcaste esta respuesta como útil.' : '👎 Marcaste esta respuesta como no útil.'} Gracias.</p>;
  }
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-tinta-suave">¿Te sirvió?</span>
        <button type="button" disabled={ocupado} onClick={() => void mandar(true, null)} className="flex items-center gap-1 rounded-md border border-borde px-2 py-1 hover:bg-hover">
          <ThumbsUp className="size-3.5" /> Útil
        </button>
        <button type="button" disabled={ocupado} onClick={() => setComentando(true)} className="flex items-center gap-1 rounded-md border border-borde px-2 py-1 hover:bg-hover">
          <ThumbsDown className="size-3.5" /> No útil
        </button>
      </div>
      {comentando && (
        <div className="flex gap-2">
          <input
            value={comentario}
            maxLength={1000}
            onChange={(e) => setComentario(e.target.value)}
            placeholder="¿Qué faltó o qué estuvo mal? (opcional)"
            className="h-9 flex-1 rounded-md border border-borde bg-panel px-2 text-sm"
          />
          <button type="button" disabled={ocupado} onClick={() => void mandar(false, comentario.trim() || null)} className="rounded-md bg-marca px-3 text-sm text-white">
            Enviar
          </button>
        </div>
      )}
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}

function Linea({ trozos }: { trozos: Trozo[] }): ReactNode {
  return trozos.map((x, i) =>
    x.tipo === 'negrita' ? (
      <strong key={i}>{x.texto}</strong>
    ) : x.tipo === 'codigo' ? (
      <code key={i} className="rounded bg-hover px-1 text-[0.85em]">
        {x.texto}
      </code>
    ) : (
      <Fragment key={i}>{x.texto}</Fragment>
    ),
  );
}

function Markdown({ texto }: { texto: string }) {
  const bloques: Bloque[] = parsearMarkdown(texto);
  return (
    <div className="space-y-2 text-sm leading-relaxed text-tinta">
      {bloques.map((b, i) => {
        if (b.tipo === 'titulo')
          return (
            <p key={i} className="font-semibold">
              <Linea trozos={b.trozos} />
            </p>
          );
        if (b.tipo === 'parrafo')
          return (
            <p key={i}>
              {b.lineas.map((l, j) => (
                <Fragment key={j}>
                  {j > 0 && <br />}
                  <Linea trozos={l} />
                </Fragment>
              ))}
            </p>
          );
        if (b.tipo === 'lista') {
          const Etiqueta = b.ordenada ? 'ol' : 'ul';
          return (
            <Etiqueta key={i} className={cn('space-y-0.5 pl-5', b.ordenada ? 'list-decimal' : 'list-disc')}>
              {b.items.map((it, j) => (
                <li key={j}>
                  <Linea trozos={it} />
                </li>
              ))}
            </Etiqueta>
          );
        }
        return (
          <div key={i} className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-borde">
                  {b.encabezado.map((c, j) => (
                    <th key={j} className="px-2 py-1 text-left font-semibold text-tinta-suave">
                      <Linea trozos={c} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {b.filas.map((f, j) => (
                  <tr key={j}>
                    {f.map((c, k) => (
                      <td key={k} className="px-2 py-1 tabular-nums">
                        <Linea trozos={c} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
