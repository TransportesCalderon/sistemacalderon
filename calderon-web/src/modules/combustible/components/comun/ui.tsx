'use client';

import { useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, CircleAlert, LoaderCircle, RefreshCw } from 'lucide-react';
import type { ErrorAccion } from '@/server/actions/result';
import { cn } from '@/shared/lib/cn';
import { conSigno } from '@/shared/lib/numeros';
import { BOTON_ICONO, BOTON_PRIMARIO, BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';

/**
 * Piezas visuales del módulo Combustible.
 * <ErrorBase> muestra el mensaje de la base tal como llega (no se reinterpreta).
 */

export type Tono = 'neutro' | 'marca' | 'exito' | 'alerta' | 'error';
const TONO: Record<Tono, string> = {
  neutro: 'bg-hover text-tinta-suave',
  marca: 'bg-marca-suave text-marca',
  exito: 'bg-exito/10 text-exito',
  alerta: 'bg-alerta-suave text-alerta',
  error: 'bg-error-suave text-error',
};

export function Chip({ tono, children, title }: { tono: Tono; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', TONO[tono])}>
      {children}
    </span>
  );
}

/** Diferencia en litros con signo; ámbar si supera la tolerancia que informó la base. */
export function DiferenciaL({ litros, toleranciaL }: { litros: number | null; toleranciaL?: number | null }) {
  if (litros === null) return <span className="text-tinta-suave">—</span>;
  const fuera = toleranciaL !== null && toleranciaL !== undefined && Math.abs(litros) > toleranciaL;
  return (
    <span
      className={cn('font-semibold tabular-nums', fuera ? 'text-alerta' : 'text-tinta')}
      title={toleranciaL === null || toleranciaL === undefined ? undefined : `Tolerancia ± ${toleranciaL} L`}
    >
      {conSigno(litros)} L
    </span>
  );
}

/** Error devuelto por una server action: mensaje de la base sin cambios. */
export function ErrorBase({ error, onRecargar }: { error: ErrorAccion | null; onRecargar?: () => void }) {
  if (!error) return null;
  return (
    <div role="alert" className="flex flex-wrap items-start gap-2 rounded-lg border border-error/30 bg-error-suave p-3 text-sm text-error">
      <CircleAlert className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0 flex-1 whitespace-pre-line">{error.mensaje}</span>
      {error.codigo === 'conflicto_version' && onRecargar && (
        <button type="button" onClick={onRecargar} className="inline-flex items-center gap-1 font-medium underline">
          <RefreshCw className="size-3.5" /> Recargar
        </button>
      )}
    </div>
  );
}

/** Estados de una lectura: cargando, error con reintento. */
export function Cargando({ texto }: { texto: string }) {
  return (
    <div className="flex items-center gap-2 p-6 text-sm text-tinta-suave">
      <LoaderCircle className="size-4 animate-spin" /> {texto}
    </div>
  );
}

export function ErrorLectura({ texto, onReintentar, error }: { texto: string; onReintentar: () => void; error?: unknown }) {
  // El mensaje de la base (o de la API) tal cual, para saber qué pasó
  const detalle = error instanceof Error ? error.message : null;
  return (
    <div className="space-y-3 p-6 text-sm">
      <p className="text-error">{texto}</p>
      {detalle && <p className="text-xs text-tinta-suave">{detalle}</p>}
      <button type="button" onClick={onReintentar} className="text-marca hover:underline">
        Reintentar
      </button>
    </div>
  );
}

export function Vacio({ icono, texto, children }: { icono: ReactNode; texto: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-marca-suave text-marca">{icono}</span>
      <p className="text-sm text-tinta-suave">{texto}</p>
      {children}
    </div>
  );
}

export function Paginador({ pagina, total, tamano, onCambiar }: { pagina: number; total: number; tamano: number; onCambiar: (p: number) => void }) {
  const paginas = Math.max(1, Math.ceil(total / tamano));
  const desde = total === 0 ? 0 : (pagina - 1) * tamano + 1;
  const hasta = Math.min(total, pagina * tamano);
  return (
    <footer className="flex items-center justify-between gap-3 border-t border-borde px-3 py-2.5 text-sm text-tinta-suave">
      <span>
        {desde}–{hasta} de {total}
      </span>
      <div className="flex items-center gap-2">
        <button type="button" className={BOTON_ICONO} disabled={pagina <= 1} onClick={() => onCambiar(pagina - 1)} aria-label="Página anterior">
          <ChevronLeft className="size-4" />
        </button>
        <span className="tabular-nums">
          {pagina} / {paginas}
        </span>
        <button type="button" className={BOTON_ICONO} disabled={pagina >= paginas} onClick={() => onCambiar(pagina + 1)} aria-label="Página siguiente">
          <ChevronRight className="size-4" />
        </button>
      </div>
    </footer>
  );
}

export function Encabezado({ titulo, subtitulo = 'Combustible', children }: { titulo: string; subtitulo?: string; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-sm text-tinta-suave">{subtitulo}</p>
        <h1 className="text-2xl font-semibold text-tinta">{titulo}</h1>
      </div>
      {children}
    </header>
  );
}

export function Seccion({ titulo, children, acciones, className }: { titulo: string; children: ReactNode; acciones?: ReactNode; className?: string }) {
  return (
    <section className={cn(TARJETA, 'space-y-4 p-5', className)} aria-label={titulo}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium text-tinta">{titulo}</h2>
        {acciones}
      </div>
      {children}
    </section>
  );
}

/** Par etiqueta / valor de una ficha. */
export function Dato({ etiqueta, children, destacado }: { etiqueta: string; children: ReactNode; destacado?: boolean }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-tinta-suave">{etiqueta}</dt>
      <dd className={cn('text-sm text-tinta', destacado && 'text-base font-semibold')}>{children}</dd>
    </div>
  );
}

const CLASE_TEXTO =
  'w-full rounded-md border border-borde bg-panel px-3 py-2 text-sm text-tinta outline-none focus:border-marca focus:ring-2 focus:ring-marca/20';

/**
 * Botón que abre un panel para escribir un motivo y confirmar (pedir anulación, rechazar,
 * anular un cierre). Si no hace falta motivo, solo pide confirmación.
 */
export function AccionConMotivo({
  etiqueta,
  icono,
  titulo,
  explicacion,
  pideMotivo = true,
  motivoOpcional = false,
  primario = false,
  ocupado,
  error,
  onConfirmar,
  onRecargar,
}: {
  etiqueta: string;
  icono?: ReactNode;
  titulo: string;
  explicacion?: string;
  pideMotivo?: boolean;
  motivoOpcional?: boolean;
  primario?: boolean;
  ocupado: boolean;
  error: ErrorAccion | null;
  /** Devuelve true si salió bien (cierra el panel). */
  onConfirmar: (motivo: string) => Promise<boolean>;
  onRecargar?: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState('');
  if (!abierto) {
    return (
      <button type="button" className={primario ? BOTON_PRIMARIO : BOTON_SECUNDARIO} onClick={() => setAbierto(true)}>
        {icono} {etiqueta}
      </button>
    );
  }
  return (
    <div className="w-full space-y-3 rounded-lg border border-borde p-4">
      <h3 className="font-medium text-tinta">{titulo}</h3>
      {explicacion && <p className="text-sm text-tinta-suave">{explicacion}</p>}
      {pideMotivo && (
        <label className="block space-y-1.5">
          <span className="block text-sm font-medium text-tinta">{motivoOpcional ? 'Motivo (opcional)' : 'Motivo *'}</span>
          <textarea rows={3} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} className={CLASE_TEXTO} />
        </label>
      )}
      <ErrorBase error={error} {...(onRecargar ? { onRecargar } : {})} />
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className={BOTON_PRIMARIO}
          disabled={ocupado || (pideMotivo && !motivoOpcional && motivo.trim() === '')}
          onClick={async () => {
            if (await onConfirmar(motivo.trim())) {
              setAbierto(false);
              setMotivo('');
            }
          }}
        >
          {ocupado && <LoaderCircle className="size-4 animate-spin" />} Confirmar
        </button>
        <button type="button" className={BOTON_SECUNDARIO} onClick={() => setAbierto(false)} disabled={ocupado}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

export const CLASE_TEXTAREA = CLASE_TEXTO;
