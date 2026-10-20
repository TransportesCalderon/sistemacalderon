'use client';

import { useState } from 'react';
import { BadgeCheck, ExternalLink, FileUp, LoaderCircle, Trash2 } from 'lucide-react';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import type { ErrorAccion } from '@/server/actions/result';
import { idAleatorio, prepararArchivo, sha256Hex, TAMANO_MAXIMO_BYTES } from '@/shared/lib/archivo';
import { formatearFechaDia, formatearFechaHora, isoAHoraLocal } from '@/shared/lib/fechas';
import { browserDb } from '@/shared/supabase/browser';
import { BOTON_PRIMARIO } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import type { EstadoValidacion } from '../../domain/carga.types';
import { BUCKET_DOCUMENTOS, ETIQUETA_TIPO_DOCUMENTO, TIPOS_DOCUMENTO, rutaArchivo, type TipoDocumento } from '../../domain/documento.types';
import {
  useAdjuntarDocumento,
  useDocumentosCarga,
  useEmisorTicket,
  useQuitarDocumento,
  useValidacionCarga,
  useValidarCarga,
} from '../../queries/hooks';
import { AccionConMotivo, Chip, ErrorBase, Seccion } from '../comun/ui';

export interface CargaParaTicket {
  id: number;
  estacionId: number | null;
  fechaHora: string;
  estadoValidacion: EstadoValidacion;
  motivoObservacion: string | null;
  creadoPor?: number | null;
}

/** Abre el archivo con un enlace temporal (5 minutos): el bucket es privado. */
async function abrirArchivo(ruta: string): Promise<string | null> {
  const ventana = window.open('', '_blank');
  const { data, error } = await browserDb().storage.from(BUCKET_DOCUMENTOS).createSignedUrl(ruta, 300);
  if (error || !data) {
    ventana?.close();
    return error?.message ?? 'No se pudo abrir el archivo.';
  }
  if (ventana) ventana.location.href = data.signedUrl;
  return null;
}

/** Ficha de carga: ticket adjunto (ver, adjuntar, quitar). */
export function TicketCarga({ carga }: { carga: CargaParaTicket }) {
  const puedeEditar = useCan('combustible.documentos:editar');
  const { data: documentos } = useDocumentosCarga(carga.id);
  const quitar = useQuitarDocumento();
  const [error, setError] = useState<ErrorAccion | null>(null);
  const [otro, setOtro] = useState(false);
  const editable = puedeEditar && carga.estadoValidacion !== 'anulada';

  return (
    <Seccion titulo="Ticket (opcional)">
      {documentos && documentos.length > 0 ? (
        <ul className="divide-y divide-borde text-sm">
          {documentos.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
              <span className="font-medium text-tinta">{ETIQUETA_TIPO_DOCUMENTO[d.tipo]}</span>
              <span className="font-mono">{d.numero}</span>
              <span className="text-tinta-suave">{formatearFechaDia(d.fecha)}</span>
              {d.archivo && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-marca hover:underline"
                  onClick={async () => {
                    const e = await abrirArchivo(d.archivo!);
                    setError(e ? { codigo: 'desconocido', mensaje: e } : null);
                  }}
                >
                  <ExternalLink className="size-3.5" /> Ver
                </button>
              )}
              {editable && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs text-tinta-suave hover:text-error"
                  disabled={quitar.isPending}
                  onClick={async () => {
                    setError(null);
                    const r = await quitar.mutateAsync({ documentoId: d.id, cargaId: carga.id });
                    if (!r.ok) setError(r.error);
                  }}
                >
                  <Trash2 className="size-3.5" /> Quitar
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-tinta-suave">Sin ticket. Es opcional: si lo tenés, cargá el número y, si querés, la foto.</p>
      )}
      <ErrorBase error={error} />
      {editable &&
        (documentos && documentos.length > 0 && !otro ? (
          <button type="button" className="inline-flex items-center gap-1 text-sm text-marca hover:underline" onClick={() => setOtro(true)}>
            <FileUp className="size-4" /> Adjuntar otro documento
          </button>
        ) : (
          <AdjuntarTicket carga={carga} onListo={() => setOtro(false)} />
        ))}
    </Seccion>
  );
}

/** Formulario para adjuntar la foto o el PDF del ticket. */
export function AdjuntarTicket({ carga, onListo }: { carga: CargaParaTicket; onListo?: () => void }) {
  const { zonaHoraria } = useSesion();
  const adjuntar = useAdjuntarDocumento();
  const { data: emisor } = useEmisorTicket(carga.estacionId);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [v, setV] = useState({
    tipo: 'ticket' as TipoDocumento,
    numero: '',
    fecha: isoAHoraLocal(carga.fechaHora, zonaHoraria).slice(0, 10),
  });
  const [error, setError] = useState<ErrorAccion | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const ocupado = subiendo || adjuntar.isPending;

  const enviar = async () => {
    setError(null);
    setSubiendo(true);
    try {
      // La foto o el PDF son opcionales (migración 47): sin archivo se registra solo el número.
      let ruta: string | null = null;
      let hash: string | null = null;
      if (archivo) {
        const { blob, extension, tipo } = await prepararArchivo(archivo);
        if (blob.size > TAMANO_MAXIMO_BYTES) throw new Error('El archivo supera los 10 MB.');
        hash = await sha256Hex(blob);
        ruta = rutaArchivo(carga.id, extension, idAleatorio());
        const subida = await browserDb().storage.from(BUCKET_DOCUMENTOS).upload(ruta, blob, { contentType: tipo, upsert: false });
        if (subida.error) throw new Error(`No se pudo subir el archivo: ${subida.error.message}`);
      }
      setSubiendo(false);
      const r = await adjuntar.mutateAsync({
        cargaId: carga.id,
        tipo: v.tipo,
        numero: v.numero,
        fecha: v.fecha,
        archivo: ruta,
        hash,
        emisorId: emisor ?? null,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setArchivo(null);
      setV({ ...v, numero: '' });
      onListo?.();
    } catch (e) {
      setError({ codigo: 'desconocido', mensaje: e instanceof Error ? e.message : 'No se pudo leer el archivo.' });
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <form
      noValidate
      className="space-y-3 rounded-lg border border-borde bg-fondo/40 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void enviar();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Campo label="Foto o PDF (opcional)" error={error?.campos?.archivo} ayuda="Las fotos se achican antes de subir.">
          <input
            type="file"
            accept="image/*,application/pdf"
            className="pt-1.5"
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
          />
        </Campo>
        <Campo label="Tipo *" error={error?.campos?.tipo}>
          <select value={v.tipo} onChange={(e) => setV({ ...v, tipo: e.target.value as TipoDocumento })}>
            {TIPOS_DOCUMENTO.map((t) => (
              <option key={t} value={t}>
                {ETIQUETA_TIPO_DOCUMENTO[t]}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Número *" error={error?.campos?.numero}>
          <input maxLength={60} value={v.numero} onChange={(e) => setV({ ...v, numero: e.target.value })} />
        </Campo>
        <Campo label="Fecha *" error={error?.campos?.fecha}>
          <input type="date" value={v.fecha} onChange={(e) => setV({ ...v, fecha: e.target.value })} />
        </Campo>
      </div>
      <ErrorBase error={error} />
      <button type="submit" className={BOTON_PRIMARIO} disabled={ocupado}>
        {ocupado ? <LoaderCircle className="size-4 animate-spin" /> : <FileUp className="size-4" />} Adjuntar
      </button>
    </form>
  );
}

/** Ficha de carga: validación contra el ticket (la hace otro usuario con rol aprobador). */
export function ValidacionCarga({ carga }: { carga: CargaParaTicket }) {
  const { zonaHoraria } = useSesion();
  const puede = useCan('combustible.cargas:transicionar');
  const { data: hecha } = useValidacionCarga(carga.id);
  const validar = useValidarCarga();
  const [error, setError] = useState<ErrorAccion | null>(null);

  if (carga.estadoValidacion === 'anulada') return null;
  if (carga.estadoValidacion === 'validada') {
    return (
      <Seccion titulo="Validación">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <Chip tono="exito">
            <BadgeCheck className="size-3.5" /> Validada
          </Chip>
          {hecha?.por && (
            <span className="text-tinta-suave">
              por {hecha.por}
              {hecha.en ? ` el ${formatearFechaHora(hecha.en, zonaHoraria)}` : ''}
            </span>
          )}
        </p>
        {hecha?.motivo && <p className="text-sm text-tinta-suave">Motivo: {hecha.motivo}</p>}
      </Seccion>
    );
  }
  if (!puede) return null;
  const observada = carga.estadoValidacion === 'observada';
  return (
    <Seccion titulo="Validación">
      <p className="text-sm text-tinta-suave">
        Comparar la carga con el ticket. La valida otro usuario con rol aprobador (no quien la registró).
        {observada && ' Está observada: hace falta escribir por qué se valida igual.'}
      </p>
      <AccionConMotivo
        etiqueta="Validar la carga"
        icono={<BadgeCheck className="size-4" />}
        primario
        titulo="Validar la carga"
        {...(carga.motivoObservacion ? { explicacion: `Observación: ${carga.motivoObservacion}` } : {})}
        motivoOpcional={!observada}
        ocupado={validar.isPending}
        error={error}
        onConfirmar={async (motivo) => {
          setError(null);
          const r = await validar.mutateAsync({ cargaId: carga.id, motivo });
          if (!r.ok) setError(r.error);
          return r.ok;
        }}
      />
    </Seccion>
  );
}
