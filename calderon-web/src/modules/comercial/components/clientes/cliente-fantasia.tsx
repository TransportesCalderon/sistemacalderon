'use client';

import { useState } from 'react';
import { Pencil, Save, X } from 'lucide-react';
import { useEnvio } from '@/modules/catalogos/components/comun';
import { ErrorBase } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from '@/shared/ui/clases';
import type { ClienteId } from '@/shared/types/dominio';
import { valoresEdicionCliente } from '../../domain/cliente.schemas';
import { useCliente, useEditarCliente } from '../../queries/hooks';

/**
 * Migración 154 · Nombre de fantasía del cliente, editable donde se lo necesite (ficha de Ventas).
 * Guarda con la edición de siempre del cliente: la base valida.
 */
export function ClienteFantasia({ clienteId }: { clienteId: number }) {
  const puede = useCan('comercial.clientes:editar');
  const { data: c } = useCliente(clienteId as ClienteId);
  const editar = useEditarCliente();
  const envio = useEnvio();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState('');

  if (!c) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-tinta-suave">Nombre de fantasía:</span>
      {editando ? (
        <>
          <input className="w-64" maxLength={120} value={valor} onChange={(e) => setValor(e.target.value)} autoFocus />
          <button
            type="button"
            className={BOTON_PRIMARIO}
            disabled={editar.isPending}
            onClick={() =>
              void envio.enviar(
                editar.mutateAsync({ ...valoresEdicionCliente(c), nombreFantasia: valor, id: c.id, versionFila: c.versionFila }),
                () => setEditando(false),
              )
            }
          >
            <Save className="size-4" /> Guardar
          </button>
          <button type="button" className={BOTON_SECUNDARIO} onClick={() => (envio.setError(null), setEditando(false))}>
            <X className="size-4" /> Cancelar
          </button>
        </>
      ) : (
        <>
          <span className="font-medium text-tinta">{c.nombreFantasia ?? '—'}</span>
          {puede && c.eliminadoEn === null && (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-marca hover:underline"
              onClick={() => {
                setValor(c.nombreFantasia ?? '');
                setEditando(true);
              }}
            >
              <Pencil className="size-3.5" /> Cambiar
            </button>
          )}
        </>
      )}
      <ErrorBase error={envio.error} />
    </div>
  );
}
