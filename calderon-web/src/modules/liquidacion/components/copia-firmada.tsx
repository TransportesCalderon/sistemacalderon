'use client';

import { useRef, useState } from 'react';
import { FileCheck2, LoaderCircle, Upload } from 'lucide-react';
import { useEnvio } from '@/modules/catalogos/components/comun';
import { ErrorBase } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import { idAleatorio, prepararArchivo } from '@/shared/lib/archivo';
import { browserDb } from '@/shared/supabase/browser';
import { BOTON_SECUNDARIO } from '@/shared/ui/clases';
import type { Liquidacion } from '../domain/liquidacion.types';
import { useAdjuntarFirmada } from '../queries/hooks';

const BUCKET = 'documentos-rrhh';

/** Subir y ver la copia firmada (escaneada) de los papeles. Bucket privado de RRHH. */
export function CopiaFirmada({ l }: { l: Liquidacion }) {
  const puede = useCan('liquidacion.liquidaciones:transicionar');
  const adjuntar = useAdjuntarFirmada();
  const envio = useEnvio();
  const input = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  if (l.estado !== 'aprobada' && l.estado !== 'pagada') return null;

  const abrir = async () => {
    if (!l.firmadaRuta) return;
    const ventana = window.open('', '_blank');
    const { data, error } = await browserDb().storage.from(BUCKET).createSignedUrl(l.firmadaRuta, 300);
    if (error || !data) {
      ventana?.close();
      setAviso(error?.message ?? 'No se pudo abrir el archivo.');
    } else if (ventana) ventana.location.href = data.signedUrl;
  };

  const subir = async (archivo: File) => {
    setAviso(null);
    setSubiendo(true);
    try {
      const { blob, extension, tipo } = await prepararArchivo(archivo);
      if (blob.size > 15 * 1024 * 1024) throw new Error('El archivo supera los 15 MB.');
      const ruta = `liquidaciones/${l.id}/${idAleatorio()}.${extension.toLowerCase().replace(/[^a-z0-9]/g, '') || 'pdf'}`;
      const r = await browserDb().storage.from(BUCKET).upload(ruta, blob, { contentType: tipo, upsert: false });
      if (r.error) throw new Error(`No se pudo subir el archivo: ${r.error.message}`);
      await envio.enviar(adjuntar.mutateAsync({ id: l.id, ruta }), () => undefined);
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No se pudo subir el archivo.');
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      {l.firmadaRuta ? (
        <button type="button" className="inline-flex items-center gap-1 text-marca hover:underline" onClick={() => void abrir()}>
          <FileCheck2 className="size-4" /> Ver la copia firmada
        </button>
      ) : (
        <span className="text-tinta-suave">Sin copia firmada todavía.</span>
      )}
      {puede && (
        <>
          <input
            ref={input}
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void subir(f);
            }}
          />
          <button type="button" className={BOTON_SECUNDARIO} disabled={subiendo} onClick={() => input.current?.click()}>
            {subiendo ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {l.firmadaRuta ? 'Reemplazar la copia firmada' : 'Subir la copia firmada (escaneada)'}
          </button>
        </>
      )}
      {aviso && <p className="w-full text-error">{aviso}</p>}
      <ErrorBase error={envio.error} />
    </div>
  );
}
