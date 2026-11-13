'use client';

import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invalidar } from '@/shared/query/invalidar';
import { CheckCircle2, ExternalLink, LoaderCircle, PenLine, Upload } from 'lucide-react';
import { abrirArchivo, borrarArchivo, subirArchivo } from '@/modules/chofer/components/archivos';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { browserDb } from '@/shared/supabase/browser';
import { BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import { subirFirmaCierre } from '../../actions/firma-cierre.actions';
import { Chip } from '../comun/ui';

/** Migración 256 · El cierre aprobado queda pendiente de firma hasta que se sube el acta firmada por el chofer. */

export interface FirmaCierre {
  id: number;
  firma: 'pendiente' | 'firmado' | 'no_aplica';
  ruta: string | null;
  nombre: string | null;
  subidoEn: string | null;
  subidoPor: string | null;
  puedeSubir: boolean;
}

const CLAVE = ['combustible', 'cierres', 'firmas'] as const;

/** Estado de firma de varios cierres (lista y ficha). */
export function useFirmasCierre(ids: readonly number[]): Map<number, FirmaCierre> {
  const lista = [...new Set(ids)].sort((a, b) => a - b);
  const { data } = useQuery({
    queryKey: [...CLAVE, lista.join(',')] as const,
    enabled: lista.length > 0,
    queryFn: async () => {
      const { data: filas, error } = await browserDb().schema('fue').rpc('fn_firmas_cierre', { p_ids: lista });
      if (error) throw error;
      const m = new Map<number, FirmaCierre>();
      for (const f of (Array.isArray(filas) ? filas : []) as Record<string, unknown>[]) {
        m.set(Number(f.id), {
          id: Number(f.id),
          firma: f.firma as FirmaCierre['firma'],
          ruta: (f.ruta as string | null) ?? null,
          nombre: (f.nombre as string | null) ?? null,
          subidoEn: (f.subido_en as string | null) ?? null,
          subidoPor: (f.subido_por as string | null) ?? null,
          puedeSubir: f.puede_subir === true,
        });
      }
      return m;
    },
  });
  return data ?? new Map<number, FirmaCierre>();
}

/** Chip para la lista: «Falta firma» o «Firmado». */
export function FirmaChip({ firma }: { firma: FirmaCierre | undefined }) {
  if (!firma || firma.firma === 'no_aplica') return null;
  return firma.firma === 'pendiente' ? (
    <Chip tono="alerta" title="Falta subir el acta firmada por el chofer">
      Falta firma
    </Chip>
  ) : (
    <Chip tono="exito" title="Acta firmada subida">
      Firmado
    </Chip>
  );
}

/** Ficha del cierre: estado de la firma, ver el acta firmada y subir (o reemplazar) el escaneo. */
export function FirmaCierreSeccion({ cierreId }: { cierreId: number }) {
  const { zonaHoraria } = useSesion();
  const firmas = useFirmasCierre([cierreId]);
  const f = firmas.get(cierreId);
  const qc = useQueryClient();
  const entrada = useRef<HTMLInputElement>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!f || f.firma === 'no_aplica') return null;

  const subir = async (archivo: File) => {
    setOcupado(true);
    setError(null);
    let ruta: string | null = null;
    try {
      const subido = await subirArchivo(archivo, `cierres/${cierreId}`);
      ruta = subido.ruta;
      const r = await subirFirmaCierre({ cierreId, ruta, nombre: subido.nombre });
      if (!r.ok) {
        await borrarArchivo(ruta);
        setError(r.error.mensaje);
        return;
      }
      await borrarArchivo(r.data.anterior);
      await invalidar(qc, 'firma_cierre');
    } catch (e) {
      await borrarArchivo(ruta);
      setError(e instanceof Error ? e.message : 'No se pudo subir el archivo.');
    } finally {
      setOcupado(false);
    }
  };

  const pendiente = f.firma === 'pendiente';
  return (
    <section className={cn(TARJETA, 'space-y-3 p-4', pendiente && 'border-2 border-alerta/50')}>
      <div className="flex flex-wrap items-center gap-2">
        {pendiente ? <PenLine className="size-5 text-alerta" /> : <CheckCircle2 className="size-5 text-exito" />}
        <h2 className="font-semibold text-tinta">{pendiente ? 'Pendiente de firma del chofer' : 'Acta firmada por el chofer'}</h2>
      </div>
      {pendiente ? (
        <p className="text-sm text-tinta-suave">
          Imprimí el acta, que la firme el chofer y subí el escaneo (PDF o foto). Mientras falte, no se le puede aprobar el FF Chofer.
        </p>
      ) : (
        <p className="text-sm text-tinta-suave">
          Subida {f.subidoEn ? formatearFechaHora(f.subidoEn, zonaHoraria) : ''}
          {f.subidoPor ? ` por ${f.subidoPor}` : ''}.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {f.ruta && (
          <button type="button" className={BOTON_SECUNDARIO} onClick={async () => setError(await abrirArchivo(f.ruta!))}>
            <ExternalLink className="size-4" /> Ver acta firmada{f.nombre ? ` (${f.nombre})` : ''}
          </button>
        )}
        {f.puedeSubir && (
          <button type="button" className={BOTON_SECUNDARIO} disabled={ocupado} onClick={() => entrada.current?.click()}>
            {ocupado ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {pendiente ? 'Subir acta firmada' : 'Reemplazar escaneo'}
          </button>
        )}
      </div>
      {error && <p className="text-sm text-error">{error}</p>}
      <input
        ref={entrada}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const archivo = e.target.files?.[0];
          e.target.value = '';
          if (archivo) void subir(archivo);
        }}
      />
    </section>
  );
}
