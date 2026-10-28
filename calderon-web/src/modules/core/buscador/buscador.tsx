'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { LoaderCircle, Search, X } from 'lucide-react';
import { useAbrirFicha } from '@/modules/core/fichas/contexto';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { RepoError } from '@/shared/repository/types';
import { browserDb } from '@/shared/supabase/browser';
import { agrupar, MINIMO_LETRAS, resultadosVisibles, type Resultado } from './resultados';

/** Tecla para mostrar en el atajo (⌘ en Mac, Ctrl en el resto). */
const esMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * Sprint 2: buscador de la barra superior. Se escribe la patente, el número, el apellido o el
 * contenedor y se elige: la ficha se abre en el panel de la derecha, sin salir de la pantalla.
 * Atajos: «/» o Ctrl+K (⌘K en Mac) para empezar a buscar; flechas y Enter para elegir; Esc cierra.
 * La base busca (seg.fn_buscar) y dice qué pantalla hace falta; acá solo se filtra por rol.
 */
export function Buscador() {
  const { permisos, versionBase } = useSesion();
  const abrirFicha = useAbrirFicha();
  const [texto, setTexto] = useState('');
  const [consulta, setConsulta] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const idLista = useId();

  // Espera a que se deje de escribir (250 ms) antes de preguntarle a la base
  useEffect(() => {
    const t = setTimeout(() => setConsulta(texto.trim()), 250);
    return () => clearTimeout(t);
  }, [texto]);

  const { data, isFetching, isError, error } = useQuery({
    queryKey: ['buscar', consulta],
    queryFn: async () => {
      const { data: filas, error: e } = await browserDb().schema('seg').rpc('fn_buscar', { p_texto: consulta });
      if (e) throw new RepoError(e);
      return filas;
    },
    enabled: consulta.length >= MINIMO_LETRAS,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const resultados = useMemo(() => (consulta.length >= MINIMO_LETRAS ? resultadosVisibles(data, permisos, versionBase) : []), [data, permisos, versionBase, consulta]);
  const grupos = useMemo(() => agrupar(resultados), [resultados]);
  const planos = useMemo(() => grupos.flatMap((g) => g.items), [grupos]);
  useEffect(() => setActivo(0), [consulta]);

  // «/» y Ctrl+K enfocan el buscador desde cualquier lado (salvo mientras se escribe en otro campo)
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const escribiendo = !!t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
      if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      } else if (e.key === '/' && !escribiendo && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, []);

  // Clic afuera: se cierra la lista
  useEffect(() => {
    if (!abierto) return;
    const alClic = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', alClic);
    return () => document.removeEventListener('mousedown', alClic);
  }, [abierto]);

  const elegir = (r: Resultado) => {
    abrirFicha(r.tipo, r.id);
    setAbierto(false);
    input.current?.blur();
  };

  const mostrarLista = abierto && texto.trim().length > 0;
  const largo = texto.trim().length;

  return (
    <div ref={caja} className="relative w-full max-w-xl">
      <div className="flex items-center gap-2 rounded-lg border border-borde bg-fondo px-3 focus-within:border-marca focus-within:bg-panel">
        <Search className="size-4 shrink-0 text-tinta-suave" aria-hidden />
        <input
          ref={input}
          type="search"
          role="combobox"
          aria-expanded={mostrarLista}
          aria-controls={idLista}
          aria-activedescendant={mostrarLista && planos[activo] ? `${idLista}-${activo}` : undefined}
          aria-label="Buscar"
          autoComplete="off"
          spellCheck={false}
          value={texto}
          placeholder="Buscar patente, chofer, operación, contenedor…"
          onChange={(e) => {
            setTexto(e.target.value);
            setAbierto(true);
          }}
          onFocus={() => setAbierto(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActivo((a) => Math.min(a + 1, Math.max(planos.length - 1, 0)));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActivo((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter' && planos[activo]) {
              e.preventDefault();
              elegir(planos[activo]);
            } else if (e.key === 'Escape') {
              // Esc es del buscador: no cierra la ficha abierta en el panel
              e.preventDefault();
              if (abierto && texto) setAbierto(false);
              else input.current?.blur();
            }
          }}
          className="h-9 min-w-0 flex-1 bg-transparent text-sm text-tinta outline-none placeholder:text-tinta-suave [&::-webkit-search-cancel-button]:hidden"
          // El borde de la caja ya marca el foco: sin el recuadro de foco general
          style={{ outline: 'none' }}
        />
        {isFetching && <LoaderCircle className="size-4 shrink-0 animate-spin text-tinta-suave" aria-hidden />}
        {texto ? (
          <button
            type="button"
            onClick={() => {
              setTexto('');
              input.current?.focus();
            }}
            className="rounded p-0.5 text-tinta-suave hover:text-tinta"
            aria-label="Borrar la búsqueda"
          >
            <X className="size-4" />
          </button>
        ) : (
          <kbd className="hidden rounded border border-borde px-1.5 text-xs text-tinta-suave sm:inline" title="Atajo para buscar">
            {esMac() ? '⌘K' : 'Ctrl K'}
          </kbd>
        )}
      </div>

      {mostrarLista && (
        <div
          id={idLista}
          role="listbox"
          aria-label="Resultados"
          className="absolute left-0 right-0 z-[1200] mt-1 max-h-[70vh] overflow-y-auto rounded-lg border border-borde bg-panel py-1 shadow-xl"
        >
          {largo < MINIMO_LETRAS ? (
            <p className="px-3 py-2 text-sm text-tinta-suave">Escribí al menos {MINIMO_LETRAS} letras o números.</p>
          ) : isError ? (
            // El mensaje de la base tal cual
            <p className="px-3 py-2 text-sm text-error">{error instanceof Error ? error.message : 'No se pudo buscar.'}</p>
          ) : planos.length === 0 ? (
            <p className="px-3 py-2 text-sm text-tinta-suave">{isFetching || consulta !== texto.trim() ? 'Buscando…' : `No se encontró nada con «${texto.trim()}».`}</p>
          ) : (
            grupos.map((g) => (
              <div key={g.tipo} role="group" aria-label={g.titulo}>
                <p className="px-3 pb-0.5 pt-2 text-xs font-medium uppercase tracking-wide text-tinta-suave">{g.titulo}</p>
                {g.items.map((r) => {
                  const i = planos.indexOf(r);
                  return (
                    <button
                      key={`${r.tipo}:${r.id}`}
                      id={`${idLista}-${i}`}
                      type="button"
                      role="option"
                      aria-selected={i === activo}
                      onMouseEnter={() => setActivo(i)}
                      onClick={() => elegir(r)}
                      className={cn('block w-full px-3 py-1.5 text-left text-sm', i === activo ? 'bg-marca-suave' : 'hover:bg-hover')}
                    >
                      <span className="font-medium text-tinta">{r.titulo}</span>
                      {r.detalle && <span className="ml-2 text-xs text-tinta-suave">{r.detalle}</span>}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
