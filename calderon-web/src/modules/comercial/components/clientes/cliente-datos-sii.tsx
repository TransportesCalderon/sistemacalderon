'use client';

import { useEffect, useState } from 'react';
import { LoaderCircle, Pencil, Save, X } from 'lucide-react';
import { useEnvio } from '@/modules/catalogos/components/comun';
import { ErrorBase } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import { useClienteSii, useGuardarClienteSii } from '@/modules/ventas/queries/hooks';
import { cn } from '@/shared/lib/cn';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';

const VACIO = { giro: '', direccion: '', comuna: '', ciudad: '', correo: '' };
type Datos = typeof VACIO;

/**
 * Migración 154 · Datos del cliente para la factura electrónica, en su ficha.
 * Se guardan con la misma función de siempre (ven.fn_guardar_cliente_sii): la base valida y decide.
 */
export function ClienteDatosSii({ clienteId, editable }: { clienteId: number; editable: boolean }) {
  const puede = useCan('ventas.facturacion:editar') && editable;
  const { data, isPending } = useClienteSii(clienteId, true);
  const guardar = useGuardarClienteSii();
  const envio = useEnvio();
  const [editando, setEditando] = useState(false);
  const [d, setD] = useState<Datos>(VACIO);

  useEffect(() => {
    if (data) setD({ giro: data.giro, direccion: data.direccion, comuna: data.comuna, ciudad: data.ciudad, correo: data.correo });
  }, [data]);

  const chileno = data?.pais === 'CL';
  const campos: { k: keyof Datos; label: string }[] = [
    { k: 'giro', label: chileno ? 'Giro' : 'Giro (opcional)' },
    { k: 'direccion', label: 'Dirección' },
    { k: 'comuna', label: chileno ? 'Comuna' : 'Comuna / provincia (opcional)' },
    { k: 'ciudad', label: 'Ciudad' },
    { k: 'correo', label: 'Correo para enviarle la factura (varios con ;)' },
  ];

  return (
    <section className={cn(TARJETA, 'p-5 lg:col-span-2')}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-tinta">Datos para la factura electrónica</h2>
        {!puede && editable && <span className="text-xs text-tinta-suave">Los cambian Finanzas o TI.</span>}
        {puede && !editando && data && (
          <button type="button" className={BOTON_SECUNDARIO} onClick={() => setEditando(true)}>
            <Pencil className="size-4" /> Editar
          </button>
        )}
      </div>
      {isPending ? (
        <p className="flex items-center gap-2 text-sm text-tinta-suave">
          <LoaderCircle className="size-4 animate-spin" /> Cargando…
        </p>
      ) : editando ? (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {campos.map((c) => (
              <Campo key={c.k} label={c.label}>
                <input value={d[c.k]} onChange={(e) => setD({ ...d, [c.k]: e.target.value })} />
              </Campo>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={BOTON_PRIMARIO}
              disabled={guardar.isPending}
              onClick={() => void envio.enviar(guardar.mutateAsync({ clienteId, ...d }), () => setEditando(false))}
            >
              <Save className="size-4" /> Guardar
            </button>
            <button
              type="button"
              className={BOTON_SECUNDARIO}
              disabled={guardar.isPending}
              onClick={() => {
                envio.setError(null);
                setEditando(false);
                if (data) setD({ giro: data.giro, direccion: data.direccion, comuna: data.comuna, ciudad: data.ciudad, correo: data.correo });
              }}
            >
              <X className="size-4" /> Cancelar
            </button>
          </div>
          <ErrorBase error={envio.error} />
        </div>
      ) : (
        <dl className="grid gap-x-6 sm:grid-cols-2">
          {campos.map((c) => (
            <div key={c.k} className="grid grid-cols-[minmax(0,10rem)_1fr] gap-3 border-b border-borde py-2 text-sm">
              <dt className="text-tinta-suave">{c.label.replace(/ \(.*\)$/, '')}</dt>
              <dd className="min-w-0 break-words text-tinta">{d[c.k] || <span className="text-tinta-suave">—</span>}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
