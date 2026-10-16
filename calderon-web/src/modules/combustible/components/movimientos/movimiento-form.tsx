'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm, type Path } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, LoaderCircle } from 'lucide-react';
import { useSesion } from '@/modules/core/session/session-provider';
import type { ErrorAccion } from '@/server/actions/result';
import { cn } from '@/shared/lib/cn';
import { horaLocalAIso, isoAHoraLocal } from '@/shared/lib/fechas';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { CLASES_MOVIMIENTO, movimientoFormSchema, type ClaseMovimiento, type MovimientoFormEntrada } from '../../domain/movimiento.schemas';
import { CATEGORIAS_ENTRADA, CATEGORIAS_SALIDA, ETIQUETA_CATEGORIA, type CategoriaMovimiento } from '../../domain/movimiento.types';
import { useCamionesCombustible, useChoferesCombustible, useRegistrarDescarga, useRegistrarMovimientoConMotivo, useTanquesBase } from '../../queries/hooks';
import { CLASE_TEXTAREA, ErrorBase } from '../comun/ui';

type Salida = ReturnType<typeof movimientoFormSchema.parse>;

const ETIQUETA_CLASE: Record<ClaseMovimiento, { titulo: string; ayuda: string }> = {
  descarga_base: { titulo: 'Descarga a base', ayuda: 'Combustible del camión que se pasa al tanque de base.' },
  descarga_camion: { titulo: 'Descarga a otro camión', ayuda: 'Para el otro camión cuenta como una entrada.' },
  salida_motivo: { titulo: 'Salida con motivo', ayuda: 'Derrame, robo denunciado o drenaje de agua. Lo aprueba otro usuario.' },
  entrada_motivo: { titulo: 'Entrada con motivo', ayuda: 'Carga de bidón. Lo aprueba otro usuario.' },
};

/**
 * Alta de un movimiento del camión. El formulario solo pide los datos; si algo no vale
 * (tanque de otro combustible, período cerrado, capacidad del tanque de base…) la base
 * lo rechaza y se muestra su mensaje.
 */
export function MovimientoForm({ camionInicial }: { camionInicial: number | null }) {
  const router = useRouter();
  const { zonaHoraria } = useSesion();
  const descargar = useRegistrarDescarga();
  const conMotivo = useRegistrarMovimientoConMotivo();
  const [error, setError] = useState<ErrorAccion | null>(null);
  const { data: camiones } = useCamionesCombustible();
  const { data: choferes } = useChoferesCombustible();
  const { data: tanques } = useTanquesBase();

  const form = useForm<MovimientoFormEntrada, unknown, Salida>({
    resolver: zodResolver(movimientoFormSchema),
    defaultValues: {
      clase: 'descarga_base',
      camionId: camionInicial ? String(camionInicial) : '',
      fechaHoraLocal: isoAHoraLocal(new Date().toISOString(), zonaHoraria),
      litros: '',
      depositoBaseId: '',
      camionDestinoId: '',
      categoria: '',
      choferId: '',
      motivo: '',
      evidencia: '',
    },
    mode: 'onTouched',
  });
  const { register, handleSubmit, watch, formState } = form;
  const e = formState.errors;
  const clase = watch('clase');
  const categorias: readonly CategoriaMovimiento[] = clase === 'entrada_motivo' ? CATEGORIAS_ENTRADA : CATEGORIAS_SALIDA;
  const ocupado = descargar.isPending || conMotivo.isPending;

  const enviar = handleSubmit(async (d) => {
    setError(null);
    const fechaHora = horaLocalAIso(d.fechaHoraLocal, zonaHoraria);
    if (!fechaHora) {
      setError({ codigo: 'validacion', mensaje: 'Revisá la fecha y la hora.' });
      return;
    }
    const r =
      d.clase === 'descarga_base' || d.clase === 'descarga_camion'
        ? await descargar.mutateAsync({
            camionId: d.camionId,
            litros: d.litros ?? 0,
            fechaHora,
            depositoBaseId: d.clase === 'descarga_base' ? d.depositoBaseId : null,
            camionDestinoId: d.clase === 'descarga_camion' ? d.camionDestinoId : null,
            choferId: d.choferId,
            motivo: d.motivo,
          })
        : await conMotivo.mutateAsync({
            camionId: d.camionId,
            categoria: d.categoria as CategoriaMovimiento,
            litros: d.litros ?? 0,
            fechaHora,
            motivo: d.motivo ?? '',
            evidencia: d.evidencia,
            choferId: d.choferId,
          });
    if (!r.ok) {
      setError(r.error);
      for (const [campo, mensaje] of Object.entries(r.error.campos ?? {})) {
        form.setError(campo as Path<MovimientoFormEntrada>, { type: 'server', message: mensaje });
      }
      return;
    }
    router.push(`/combustible/movimientos?camion=${d.camionId}`);
  });

  return (
    <form onSubmit={enviar} noValidate className="space-y-5">
      <Link href="/combustible/movimientos" className="inline-flex items-center gap-1 text-sm text-tinta-suave hover:text-tinta">
        <ArrowLeft className="size-4" /> Movimientos del camión
      </Link>
      <header>
        <p className="text-sm text-tinta-suave">Combustible</p>
        <h1 className="text-2xl font-semibold text-tinta">Registrar movimiento del camión</h1>
      </header>

      <ErrorBase error={error} />

      <fieldset className={cn(TARJETA, 'grid gap-3 p-5 sm:grid-cols-2')}>
        <legend className="sr-only">Qué movimiento es</legend>
        {CLASES_MOVIMIENTO.map((c) => (
          <label key={c} className={cn('flex items-start gap-2 rounded-lg border p-3 text-sm', clase === c ? 'border-marca bg-marca-suave/40' : 'border-borde')}>
            <input type="radio" value={c} className="mt-0.5 accent-marca" {...register('clase')} />
            <span>
              <span className="font-medium text-tinta">{ETIQUETA_CLASE[c].titulo}</span>
              <span className="block text-xs text-tinta-suave">{ETIQUETA_CLASE[c].ayuda}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <section className={cn(TARJETA, 'grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3')} aria-label="Datos del movimiento">
        <Campo label="Camión *" error={e.camionId?.message}>
          <select {...register('camionId')}>
            <option value="">Elegí…</option>
            {camiones?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigoInterno} · {c.patente}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Fecha y hora *" error={e.fechaHoraLocal?.message} ayuda={`Hora de ${zonaHoraria}`}>
          <input type="datetime-local" {...register('fechaHoraLocal')} />
        </Campo>
        <Campo label="Litros *" error={e.litros?.message}>
          <input inputMode="decimal" {...register('litros')} />
        </Campo>

        {clase === 'descarga_base' && (
          <Campo label="Tanque de base *" error={e.depositoBaseId?.message}>
            <select {...register('depositoBaseId')}>
              <option value="">Elegí…</option>
              {tanques?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.codigo} · {t.nombre}
                </option>
              ))}
            </select>
          </Campo>
        )}
        {clase === 'descarga_camion' && (
          <Campo label="Camión que recibe *" error={e.camionDestinoId?.message}>
            <select {...register('camionDestinoId')}>
              <option value="">Elegí…</option>
              {camiones?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigoInterno} · {c.patente}
                </option>
              ))}
            </select>
          </Campo>
        )}
        {(clase === 'salida_motivo' || clase === 'entrada_motivo') && (
          <Campo label="Categoría *" error={e.categoria?.message}>
            <select {...register('categoria')}>
              <option value="">Elegí…</option>
              {categorias.map((c) => (
                <option key={c} value={c}>
                  {ETIQUETA_CATEGORIA[c]}
                </option>
              ))}
            </select>
          </Campo>
        )}
        <Campo label="Chofer" error={e.choferId?.message}>
          <select {...register('choferId')}>
            <option value="">Sin informar</option>
            {choferes?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </Campo>
      </section>

      <section className={cn(TARJETA, 'grid gap-4 p-5 sm:grid-cols-2')} aria-label="Motivo">
        <label className="block space-y-1.5">
          <span className="block text-sm font-medium text-tinta">{clase === 'salida_motivo' || clase === 'entrada_motivo' ? 'Motivo *' : 'Observación'}</span>
          <textarea rows={3} className={CLASE_TEXTAREA} {...register('motivo')} />
          {e.motivo?.message && <span className="block text-xs text-error">{e.motivo.message}</span>}
        </label>
        {clase === 'salida_motivo' && (
          <label className="block space-y-1.5">
            <span className="block text-sm font-medium text-tinta">Evidencia</span>
            <textarea rows={3} className={CLASE_TEXTAREA} placeholder="Número de denuncia, acta, foto…" {...register('evidencia')} />
            {e.evidencia?.message && <span className="block text-xs text-error">{e.evidencia.message}</span>}
          </label>
        )}
      </section>

      <div className="flex flex-wrap gap-3">
        <button type="submit" className={BOTON_PRIMARIO} disabled={ocupado}>
          {ocupado && <LoaderCircle className="size-4 animate-spin" />} Registrar movimiento
        </button>
        <Link href="/combustible/movimientos" className={BOTON_SECUNDARIO}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
