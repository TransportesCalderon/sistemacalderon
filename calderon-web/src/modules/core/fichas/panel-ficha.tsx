'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronRight, X } from 'lucide-react';
import { can } from '@/modules/core/permissions/resolver';
import { useSesion } from '@/modules/core/session/session-provider';
import { baseTiene } from '@/shared/lib/version-base';
import { COMPONENTES_FICHA } from './componentes';
import { FichaContext, type ContextoFicha } from './contexto';
import { conFicha, leerFicha, leerRastro, rastroAlAbrir, sinFicha, textoFicha, volverA, type RefFicha } from './ficha-url';
import { FICHAS } from './tipos';

/**
 * Sprint 1 · S1-01 y S1-07: la ficha de un camión, chofer, cliente, carga o viaje se abre a la
 * derecha sin salir de la lista. Reglas (docs/DECISIONES.md):
 *   - un solo panel: abrir otra ficha reemplaza la que está (Atrás vuelve a la anterior);
 *   - rastro arriba: «Camión SXXV17 › Chofer Pérez › Carga #1234», cada paso vuelve;
 *   - la fila de la lista de donde salió queda resaltada (globals.css, data-ficha-abierta).
 * Va en el layout dentro de <Suspense> (usa useSearchParams).
 */
export function PanelFicha() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { permisos, versionBase } = useSesion();
  const ficha = useMemo(() => leerFicha(params.get('ficha')), [params]);
  const rastro = useMemo(() => leerRastro(params.get('rastro')), [params]);
  const [nombres, setNombres] = useState<Record<string, string>>({});
  const panel = useRef<HTMLElement>(null);

  const ir = useCallback(
    (f: RefFicha | null, r: RefFicha[] = []) => {
      const busqueda = params.toString();
      router.push(`${pathname}${f ? conFicha(busqueda, f, r) : sinFicha(busqueda)}`, { scroll: false });
    },
    [router, pathname, params],
  );

  const nombrar = useCallback((r: RefFicha, nombre: string) => {
    setNombres((prev) => (prev[textoFicha(r)] === nombre ? prev : { ...prev, [textoFicha(r)]: nombre }));
  }, []);

  const clave = ficha ? textoFicha(ficha) : null;
  const contexto = useMemo<ContextoFicha | null>(
    () =>
      ficha
        ? {
            actual: ficha,
            rastro,
            cerrar: () => ir(null),
            abrir: (nueva) => ir(nueva, rastroAlAbrir(ficha, rastro, nueva)),
            nombrar,
          }
        : null,
    [ficha, rastro, ir, nombrar],
  );

  // Esc cierra; al abrir otra ficha, el foco va al panel (teclado y lectores de pantalla)
  useEffect(() => {
    if (!contexto) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) contexto.cerrar();
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [contexto]);
  useEffect(() => {
    if (clave) panel.current?.focus();
  }, [clave]);

  if (!ficha || !contexto) return null;

  const def = FICHAS[ficha.tipo];
  const puede = can(permisos, `${def.pantalla}:ver`);
  const hayBase = !def.version || baseTiene(versionBase, def.version);
  const Componente = COMPONENTES_FICHA[ficha.tipo];
  const etiqueta = (r: RefFicha) => nombres[textoFicha(r)] ?? `${FICHAS[r.tipo].titulo} ${r.id}`;

  return (
    <FichaContext.Provider value={contexto}>
      <aside
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-label={`Ficha: ${etiqueta(ficha)}`}
        className="fixed inset-y-0 right-0 z-[1100] flex w-full max-w-[720px] flex-col border-l border-borde bg-panel shadow-2xl outline-none"
        style={{ outline: 'none' }}
      >
        <div className="flex items-center gap-2 border-b border-borde px-4 py-2">
          <nav aria-label="Rastro de fichas" className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 text-sm">
            {rastro.map((r, i) => (
              <Fragment key={`${textoFicha(r)}-${i}`}>
                <button
                  type="button"
                  onClick={() => {
                    const v = volverA(rastro, i);
                    if (v) ir(v.ficha, v.rastro);
                  }}
                  className="max-w-48 truncate text-marca hover:underline"
                  title={`Volver a ${etiqueta(r)}`}
                >
                  <span className="text-tinta-suave">{FICHAS[r.tipo].titulo}</span> {nombres[textoFicha(r)] ?? r.id}
                </button>
                <ChevronRight className="size-3.5 shrink-0 text-tinta-suave" aria-hidden />
              </Fragment>
            ))}
            <span className="max-w-64 truncate font-medium text-tinta" aria-current="page">
              <span className="font-normal text-tinta-suave">{def.titulo}</span> {nombres[textoFicha(ficha)] ?? ficha.id}
            </span>
          </nav>
          <button
            type="button"
            onClick={contexto.cerrar}
            aria-label="Cerrar la ficha"
            title="Cerrar (Esc)"
            className="rounded-md p-1.5 text-tinta-suave hover:bg-hover hover:text-tinta"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {!puede ? (
            <p className="text-sm text-tinta-suave">Tu rol no puede ver esta ficha.</p>
          ) : !hayBase ? (
            <p className="text-sm text-tinta-suave">Esta ficha va a estar disponible cuando se aplique la actualización de la base.</p>
          ) : (
            <Componente key={textoFicha(ficha)} id={ficha.id} />
          )}
        </div>
      </aside>
    </FichaContext.Provider>
  );
}
