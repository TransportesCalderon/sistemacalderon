'use client';

import { useState } from 'react';
import { Camera, ExternalLink, LoaderCircle, Trash2 } from 'lucide-react';
import { ErrorBase } from '@/modules/combustible/components/comun/ui';
import { useSesion } from '@/modules/core/session/session-provider';
import type { ErrorAccion } from '@/server/actions/result';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { ETIQUETA_DOCUMENTO, TIPOS_DOCUMENTO_OPERACION, type DocumentoOperacion, type TipoDocumentoOperacion } from '../domain/chofer.types';
import { useQuitarDocumentoChofer, useQuitarDocumentoOficina, useSubirDocumentoChofer, useSubirDocumentoOficina } from '../queries/hooks';
import { abrirArchivo, borrarArchivo, posicionActual, subirArchivo } from './archivos';

type Modo = 'chofer' | 'oficina';

/** Lista de documentos de una operación con «Ver» y, si se puede, «Quitar». */
export function ListaDocumentos({ documentos, modo, puedeQuitar }: { documentos: DocumentoOperacion[]; modo: Modo; puedeQuitar: boolean }) {
  const { zonaHoraria } = useSesion();
  const quitarChofer = useQuitarDocumentoChofer();
  const quitarOficina = useQuitarDocumentoOficina();
  const quitar = modo === 'chofer' ? quitarChofer : quitarOficina;
  const [error, setError] = useState<ErrorAccion | null>(null);

  if (documentos.length === 0) return <p className="text-sm text-tinta-suave">Todavía no hay documentos.</p>;
  return (
    <>
      <ul className="divide-y divide-borde text-sm">
        {documentos.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
            <span className="font-medium text-tinta">{ETIQUETA_DOCUMENTO[d.tipo]}</span>
            <span className="text-xs text-tinta-suave">
              {formatearFechaHora(d.subidoEn, zonaHoraria)}
              {d.subidoPor && ` · ${d.subidoPor}`}
            </span>
            {d.nota && <span className="w-full text-xs text-tinta-suave">{d.nota}</span>}
            <span className="ml-auto flex items-center gap-3">
              <button
                type="button"
                className="inline-flex items-center gap-1 text-marca hover:underline"
                onClick={async () => {
                  const e = await abrirArchivo(d.archivo);
                  setError(e ? { codigo: 'desconocido', mensaje: e } : null);
                }}
              >
                <ExternalLink className="size-4" /> Ver
              </button>
              {puedeQuitar && (modo === 'oficina' || d.porChofer) && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs text-tinta-suave hover:text-error"
                  disabled={quitar.isPending}
                  onClick={async () => {
                    setError(null);
                    const r = await quitar.mutateAsync({ documentoId: d.id });
                    if (r.ok) await borrarArchivo(r.data);
                    else setError(r.error);
                  }}
                >
                  <Trash2 className="size-4" /> Quitar
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      <ErrorBase error={error} />
    </>
  );
}

/** Subir un documento o una foto (desde el celular abre la cámara). */
export function SubirDocumento({ servicioId, modo, onListo }: { servicioId: number; modo: Modo; onListo?: () => void }) {
  const { choferId } = useSesion();
  const subirChofer = useSubirDocumentoChofer();
  const subirOficina = useSubirDocumentoOficina();
  const subir = modo === 'chofer' ? subirChofer : subirOficina;
  const [tipo, setTipo] = useState<TipoDocumentoOperacion | ''>('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [nota, setNota] = useState('');
  const [error, setError] = useState<ErrorAccion | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [listo, setListo] = useState(false);
  const ocupado = subiendo || subir.isPending;

  const enviar = async () => {
    setError(null);
    setListo(false);
    if (!archivo) return setError({ codigo: 'validacion', mensaje: 'Sacá la foto o elegí el archivo.' });
    if (!tipo) return setError({ codigo: 'validacion', mensaje: 'Elegí qué documento es.' });
    setSubiendo(true);
    let ruta: string | null = null;
    try {
      const carpeta = modo === 'chofer' ? `${choferId}/op-${servicioId}` : `oficina/op-${servicioId}`;
      const [subido, donde] = await Promise.all([subirArchivo(archivo, carpeta), modo === 'chofer' ? posicionActual() : Promise.resolve(null)]);
      ruta = subido.ruta;
      setSubiendo(false);
      const r = await subir.mutateAsync({
        servicioId,
        tipo,
        archivo: subido.ruta,
        hash: subido.hash,
        nombreArchivo: subido.nombre,
        nota,
        latitud: donde?.latitud ?? null,
        longitud: donde?.longitud ?? null,
      });
      if (!r.ok) {
        await borrarArchivo(ruta);
        setError(r.error);
        return;
      }
      setArchivo(null);
      setTipo('');
      setNota('');
      setListo(true);
      onListo?.();
    } catch (e) {
      setSubiendo(false);
      setError({ codigo: 'desconocido', mensaje: e instanceof Error ? e.message : 'No se pudo subir.' });
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-borde bg-fondo/40 p-3">
      <Campo label="¿Qué documento es?">
        <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoDocumentoOperacion)}>
          <option value="">Elegí…</option>
          {TIPOS_DOCUMENTO_OPERACION.map((t) => (
            <option key={t} value={t}>
              {ETIQUETA_DOCUMENTO[t]}
            </option>
          ))}
        </select>
      </Campo>
      <label className={`${BOTON_SECUNDARIO} w-full cursor-pointer`}>
        <Camera className="size-5" />
        {archivo ? archivo.name : 'Sacar foto o elegir archivo'}
        <input
          type="file"
          accept="image/*,application/pdf"
          capture={modo === 'chofer' ? 'environment' : undefined}
          className="sr-only"
          onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
        />
      </label>
      <Campo label="Nota (opcional)">
        <input value={nota} maxLength={500} onChange={(e) => setNota(e.target.value)} placeholder="Ej.: precinto nuevo, contenedor con golpe" />
      </Campo>
      <ErrorBase error={error} />
      {listo && <p className="text-sm text-exito">Listo, quedó subido.</p>}
      <button type="button" className={`${BOTON_PRIMARIO} w-full`} disabled={ocupado} onClick={() => void enviar()}>
        {ocupado && <LoaderCircle className="size-4 animate-spin" />} Subir
      </button>
    </div>
  );
}
