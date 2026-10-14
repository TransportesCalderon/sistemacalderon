'use client';

import { useEffect, useState } from 'react';
import { Eye, EyeOff, LoaderCircle, Lock } from 'lucide-react';
import { useCan } from '@/modules/core/permissions/can';
import type { ChoferId } from '@/shared/types/dominio';
import { ETIQUETA_TIPO_DOCUMENTO, type DocumentoChofer as Documento } from '../../domain/chofer.types';
import { useRevelarDocumento } from '../../queries/hooks';

/** Tiempo que el documento queda visible antes de volver a ocultarse. */
const SEGUNDOS_VISIBLE = 60;

/**
 * Documento del chofer enmascarado (P-MAE-03). "Mostrar documento" llama a una server
 * action que registra el acceso en aud.acceso_sensible antes de leer el dato. El valor
 * vive solo en el estado de este componente: no entra en la caché ni en la URL.
 */
export function DocumentoChofer({ choferId }: { choferId: ChoferId }) {
  const puedeVer = useCan('flota.documento_chofer:ver');
  const revelar = useRevelarDocumento();
  const [documento, setDocumento] = useState<Documento | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!documento) return;
    const t = setTimeout(() => setDocumento(null), SEGUNDOS_VISIBLE * 1000);
    return () => clearTimeout(t);
  }, [documento]);

  if (!puedeVer) {
    return (
      <span className="inline-flex items-center gap-1.5 text-tinta-suave" title="Dato personal: visible para RR. HH., Analista de control, TI y Auditor">
        <Lock className="size-3.5" /> Reservado
      </span>
    );
  }

  if (documento) {
    return (
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-mono">
          {ETIQUETA_TIPO_DOCUMENTO[documento.tipo]} {documento.numero}
        </span>
        <button type="button" onClick={() => setDocumento(null)} className="inline-flex items-center gap-1 text-sm text-marca hover:underline">
          <EyeOff className="size-3.5" /> Ocultar
        </button>
        <span className="w-full text-xs text-tinta-suave">Acceso registrado en auditoría. Se oculta en {SEGUNDOS_VISIBLE} s.</span>
      </span>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="font-mono tracking-widest text-tinta-suave">••••••••</span>
      <button
        type="button"
        disabled={revelar.isPending}
        onClick={async () => {
          setError(null);
          const r = await revelar.mutateAsync(choferId);
          if (r.ok) setDocumento(r.data);
          else setError(r.error.mensaje);
        }}
        className="inline-flex items-center gap-1 text-sm text-marca hover:underline disabled:opacity-60"
      >
        {revelar.isPending ? <LoaderCircle className="size-3.5 animate-spin" /> : <Eye className="size-3.5" />}
        Mostrar documento
      </button>
      {error ? (
        <span className="w-full text-xs text-error">{error}</span>
      ) : (
        <span className="w-full text-xs text-tinta-suave">Al mostrarlo, el acceso queda registrado.</span>
      )}
    </span>
  );
}
