'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search, Smartphone, X } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { buscarEnMapa, letrasDe, MINIMO_LETRAS_MAPA, type CelularBuscable, type ResultadoMapa } from '../domain/buscar-en-mapa';
import type { CamionEnVivo, DetalleMapa } from '../domain/flota.types';

const sePuedeElegir = (r: ResultadoMapa | undefined) => !!r && (r.tipo === 'celular' || r.conPosicion);

/**
 * 26/11/2026 · Buscador del Mapa de flota (arriba a la izquierda, también en pantalla completa). Se escribe la
 * patente o el código, el chofer, el N° de operación, el cliente o el contenedor y se elige: el mapa va hasta el
 * camión y abre su ficha (o hasta el celular del chofer). Flechas y Enter para elegir; Esc borra. «/» lleva acá,
 * como el buscador de la Pizarra.
 */
export function BuscadorMapa({
  camiones,
  detalles,
  celulares,
  verCelulares,
  onVerCelulares,
  onElegir,
  className,
}: {
  camiones: CamionEnVivo[];
  detalles: DetalleMapa[];
  celulares: CelularBuscable[];
  verCelulares?: boolean;
  onVerCelulares?: (ver: boolean) => void;
  onElegir: (r: ResultadoMapa) => void;
  className?: string;
}) {
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  // −1: el primero que se puede elegir (los que no tienen posición se muestran, pero no se eligen)
  const [activo, setActivo] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const idLista = useId();
  const { resultados, total } = useMemo(() => buscarEnMapa(texto, camiones, detalles, celulares), [texto, camiones, detalles, celulares]);
  const actual = activo >= 0 && sePuedeElegir(resultados[activo]) ? activo : resultados.findIndex(sePuedeElegir);

  // «/» lleva al buscador (salvo mientras se escribe en otro campo)
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const escribiendo = !!t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
      if (e.key === '/' && !escribiendo && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
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

  const elegir = (r: ResultadoMapa | undefined) => {
    if (!r || !sePuedeElegir(r)) return;
    setTexto(r.texto);
    setAbierto(false);
    input.current?.blur();
    onElegir(r);
  };
  /** El siguiente que se puede elegir, hacia abajo (+1) o hacia arriba (−1). */
  const mover = (paso: 1 | -1) => {
    for (let i = actual + paso; i >= 0 && i < resultados.length; i += paso) {
      if (sePuedeElegir(resultados[i])) {
        setActivo(i);
        return;
      }
    }
  };

  const largo = letrasDe(texto);
  const mostrarLista = abierto && texto.trim().length > 0;

  return (
    <div ref={caja} className={cn('relative z-10', className)}>
      <div className="flex h-8 items-center gap-1.5 rounded-md border border-borde bg-white/95 px-2 shadow focus-within:border-marca">
        <Search className="size-4 shrink-0 text-tinta-suave" aria-hidden />
        <input
          ref={input}
          type="search"
          role="combobox"
          aria-expanded={mostrarLista}
          aria-controls={idLista}
          aria-activedescendant={mostrarLista && resultados[actual] ? `${idLista}-${actual}` : undefined}
          aria-label="Buscar en el mapa"
          autoComplete="off"
          spellCheck={false}
          // La Pizarra y la barra de arriba respetan esta marca: acá «/» es de este buscador
          data-busqueda-local=""
          value={texto}
          placeholder="Patente, chofer, operación"
          title="Buscar por patente o código, chofer, N° de operación, cliente o contenedor (atajo: /)"
          onChange={(e) => {
            setTexto(e.target.value);
            setActivo(-1);
            setAbierto(true);
          }}
          onFocus={() => setAbierto(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setAbierto(true);
              mover(1);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              mover(-1);
            } else if (e.key === 'Enter') {
              e.preventDefault();
              elegir(resultados[actual]);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              if (texto) setTexto('');
              else input.current?.blur();
            }
          }}
          className="h-full min-w-0 flex-1 bg-transparent text-sm text-tinta outline-none placeholder:text-tinta-suave [&::-webkit-search-cancel-button]:hidden"
          style={{ outline: 'none' }}
        />
        {texto && (
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
        )}
      </div>

      {mostrarLista && (
        <div
          id={idLista}
          role="listbox"
          aria-label="Encontrados en el mapa"
          className="absolute right-0 left-0 mt-1 max-h-72 overflow-y-auto rounded-md border border-borde bg-white py-1 text-sm shadow-xl sm:right-auto sm:w-80"
        >
          {largo < MINIMO_LETRAS_MAPA ? (
            <p className="px-3 py-2 text-tinta-suave">Escribí al menos {MINIMO_LETRAS_MAPA} letras o números.</p>
          ) : resultados.length === 0 ? (
            <div className="space-y-1.5 px-3 py-2">
              <p className="text-tinta-suave">No hay nada en el mapa con «{texto.trim()}».</p>
              {onVerCelulares && !verCelulares && (
                <button
                  type="button"
                  onClick={() => {
                    onVerCelulares(true);
                    input.current?.focus();
                  }}
                  className="inline-flex items-center gap-1 text-left font-medium text-marca hover:underline"
                >
                  <Smartphone className="size-4" /> Buscar también en los celulares de los choferes
                </button>
              )}
            </div>
          ) : (
            <>
              {resultados.map((r, i) => {
                const puede = sePuedeElegir(r);
                return (
                  <button
                    key={`${r.tipo}:${r.id}`}
                    id={`${idLista}-${i}`}
                    type="button"
                    role="option"
                    aria-selected={i === actual}
                    aria-disabled={!puede}
                    disabled={!puede}
                    onMouseEnter={() => puede && setActivo(i)}
                    onClick={() => elegir(r)}
                    className={cn('block w-full px-3 py-1.5 text-left', !puede ? 'cursor-default opacity-60' : i === actual ? 'bg-marca-suave' : 'hover:bg-hover')}
                  >
                    <span className={cn('block font-medium', r.tipo === 'celular' ? 'text-[#5b21b6]' : 'text-tinta')}>{r.titulo}</span>
                    {(r.detalle || !puede) && (
                      <span className="block text-xs text-tinta-suave">
                        {[r.detalle, !puede && 'sin posición del GPS: no está en el mapa'].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </button>
                );
              })}
              {total > resultados.length && (
                <p className="border-t border-borde px-3 pt-1.5 pb-1 text-xs text-tinta-suave">
                  Hay {total - resultados.length} más: escribí algo más para encontrarlo.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
