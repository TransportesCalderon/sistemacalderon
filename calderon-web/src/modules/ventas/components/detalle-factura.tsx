'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ListChecks } from 'lucide-react';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { cn } from '@/shared/lib/cn';
import { VERSION_DETALLE } from '../domain/detalle';
import { useDetalleCliente, useVistaDetalle } from '../queries/hooks';

/**
 * Migración 125 · Lista desplegable para elegir qué datos de la operación salen en cada renglón de la
 * factura (operación, ruta, contenedor, CRT, MIC, N° de guía…). Arranca con lo guardado para el
 * cliente y muestra cómo queda el renglón (el texto lo arma la base).
 */
export function ElegirDetalle({
  clienteId,
  servicioId,
  onCambiar,
  onElegir,
  nota,
}: {
  clienteId: number;
  /** Una operación para mostrar cómo queda el renglón. */
  servicioId: number | null;
  onCambiar?: (campos: string[]) => void;
  /** Solo cuando la persona tilda o destilda (no al abrir): por ejemplo, para guardarlo en el momento. */
  onElegir?: (campos: string[]) => void;
  /** Texto debajo de la lista (por defecto, que queda guardado para el cliente). */
  nota?: ReactNode;
}) {
  const hay = useBaseTiene(VERSION_DETALLE);
  const { data } = useDetalleCliente(clienteId, null, hay);
  const [campos, setCampos] = useState<string[] | null>(null);
  const avisar = useRef(onCambiar);
  avisar.current = onCambiar;
  const elegir = useRef(onElegir);
  elegir.current = onElegir;
  useEffect(() => {
    if (data && campos === null) {
      setCampos(data.elegidos);
      avisar.current?.(data.elegidos);
    }
  }, [data, campos]);
  const { data: ejemplo } = useVistaDetalle(servicioId, campos ?? [], hay);

  if (!hay || !data || campos === null) return null;
  const etiqueta = (c: string) => data.campos.find((x) => x.codigo === c)?.etiqueta ?? c;
  const alternar = (c: string) => {
    // Se guardan en el orden de la lista (el de la factura)
    const nuevos = data.campos.map((x) => x.codigo).filter((x) => (x === c ? !campos.includes(c) : campos.includes(x)));
    setCampos(nuevos);
    avisar.current?.(nuevos);
    elegir.current?.(nuevos);
  };

  return (
    <details className="group rounded-md border border-borde bg-panel text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 select-none">
        <ListChecks className="size-4 shrink-0 text-tinta-suave" />
        <span className="font-medium">Datos en cada renglón:</span>
        <span className="min-w-0 flex-1 truncate text-tinta-suave">{campos.length ? campos.map(etiqueta).join(', ') : 'ninguno'}</span>
        <ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-3 border-t border-borde p-3">
        <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {data.campos.map((c) => (
            <label key={c.codigo} className="flex items-center gap-2">
              <input type="checkbox" className="size-4 accent-marca" checked={campos.includes(c.codigo)} onChange={() => alternar(c.codigo)} />
              {c.etiqueta}
            </label>
          ))}
        </div>
        {servicioId && campos.length > 0 && (
          <p className={cn('rounded-md bg-hover px-2 py-1.5 text-xs', !ejemplo && 'text-tinta-suave')}>
            <span className="font-medium">Así queda: </span>
            {ejemplo ?? '…'}
          </p>
        )}
        {campos.includes('valor_usd') && (
          <p className="text-xs text-tinta-suave">«Valor del flete en dólares» se agrega al emitir la factura, con el importe de cada renglón (se ve en la vista previa).</p>
        )}
        {nota ?? <p className="text-xs text-tinta-suave">Queda guardado para este cliente: las próximas prefacturas salen igual.</p>}
      </div>
    </details>
  );
}
