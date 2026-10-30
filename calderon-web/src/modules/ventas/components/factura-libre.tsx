'use client';

import { useState } from 'react';
import { FilePlus2, LoaderCircle, Plus, Trash2, X } from 'lucide-react';
import { useEnvio } from '@/modules/catalogos/components/comun';
import { ErrorBase } from '@/modules/combustible/components/comun/ui';
import { cn } from '@/shared/lib/cn';
import { BOTON_PRIMARIO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { useCrearFacturaLibre, useEmpresas } from '../queries/hooks';

/** Migración 144: desde esta versión se puede facturar sin operación. */
export const VERSION_FACTURA_LIBRE = 144;

type Fila = { clave: number; descripcion: string; cantidad: string; precio: string };
let k = 0;
const nueva = (): Fila => ({ clave: ++k, descripcion: '', cantidad: '1', precio: '' });

/**
 * Migración 144: factura sin operación (gastos extra). Se elige el cliente y se escribe cada renglón
 * tal cual tiene que salir en la factura (por ejemplo «COSTO ADICIONAL AL CAMIONAJE POR PAGO EN GATE
 * IN EN CAPITAN CORTES»). Arma la prefactura; desde ahí se revisa y se emite como siempre.
 */
export function FacturaLibre({ onCreada, onCerrar }: { onCreada: (id: number) => void; onCerrar: () => void }) {
  const clientes = useEmpresas(null, 'clientes');
  const crear = useCrearFacturaLibre();
  const envio = useEnvio();
  const [clienteId, setClienteId] = useState('');
  const [filas, setFilas] = useState<Fila[]>([nueva()]);
  const [obs, setObs] = useState('');
  const cambiar = (clave: number, c: Partial<Fila>) => setFilas((fs) => fs.map((f) => (f.clave === clave ? { ...f, ...c } : f)));

  return (
    <section className={cn(TARJETA, 'space-y-3 border-marca/40 p-4')}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-tinta">Factura sin operación</h2>
          <p className="text-sm text-tinta-suave">Para gastos extra. Cada renglón sale en la factura tal cual lo escribís (precio en dólares).</p>
        </div>
        <button type="button" onClick={onCerrar} className="rounded-md p-1 text-tinta-suave hover:bg-hover" aria-label="Cerrar">
          <X className="size-4" />
        </button>
      </div>

      <Campo label="Cliente" error={envio.campo('clienteId')}>
        <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
          <option value="">Elegí…</option>
          {(clientes.data ?? [])
            .filter((c) => c.clienteId)
            .map((c) => (
              <option key={c.id} value={c.clienteId ?? ''}>
                {c.nombre}
              </option>
            ))}
        </select>
      </Campo>

      <div className="space-y-2">
        {filas.map((f, i) => (
          <div key={f.clave} className="grid gap-2 sm:grid-cols-[1fr_90px_130px_auto] sm:items-end">
            <Campo label={i === 0 ? 'Qué se cobra' : ''}>
              <input
                value={f.descripcion}
                maxLength={250}
                placeholder="Ej.: COSTO ADICIONAL AL CAMIONAJE POR PAGO EN GATE IN EN CAPITAN CORTES"
                onChange={(e) => cambiar(f.clave, { descripcion: e.target.value })}
              />
            </Campo>
            <Campo label={i === 0 ? 'Cantidad' : ''}>
              <input inputMode="decimal" value={f.cantidad} onChange={(e) => cambiar(f.clave, { cantidad: e.target.value })} />
            </Campo>
            <Campo label={i === 0 ? 'Precio USD' : ''}>
              <input inputMode="decimal" value={f.precio} onChange={(e) => cambiar(f.clave, { precio: e.target.value })} />
            </Campo>
            <button
              type="button"
              aria-label="Quitar el renglón"
              className="mb-1 rounded-md p-2 text-tinta-suave hover:text-error disabled:opacity-40"
              disabled={filas.length === 1}
              onClick={() => setFilas((fs) => fs.filter((x) => x.clave !== f.clave))}
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
        <button type="button" className="inline-flex items-center gap-1 text-sm text-marca hover:underline" onClick={() => setFilas((fs) => [...fs, nueva()])}>
          <Plus className="size-4" /> Agregar otro renglón
        </button>
      </div>

      <Campo label="Observación (opcional)">
        <input value={obs} maxLength={1000} onChange={(e) => setObs(e.target.value)} />
      </Campo>

      <ErrorBase error={envio.error} />
      <button
        type="button"
        className={BOTON_PRIMARIO}
        disabled={crear.isPending}
        onClick={async () => {
          envio.setError(null);
          const r = await crear.mutateAsync({
            clienteId: Number(clienteId) || 0,
            observacion: obs,
            renglones: filas.map((f) => ({ descripcion: f.descripcion, cantidad: f.cantidad, precio: f.precio })),
          });
          if (!r.ok) return envio.setError(r.error);
          onCreada(r.data);
        }}
      >
        {crear.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <FilePlus2 className="size-4" />} Armar la prefactura
      </button>
    </section>
  );
}
