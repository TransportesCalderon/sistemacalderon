'use client';

import { useState, type ReactNode } from 'react';
import { useForm, type Path } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { LoaderCircle, Save } from 'lucide-react';
import { useCan } from '@/modules/core/permissions/can';
import type { ErrorAccion } from '@/server/actions/result';
import { BOTON_PRIMARIO } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import type { ChoferId } from '@/shared/types/dominio';
import { aFormularioBorrador, borradorFormSchema, type BorradorFormEntrada } from '../../domain/cierre.schemas';
import { ETIQUETA_TEST_ALCOHOL, RESULTADOS_TEST_ALCOHOL, type CierreViaje } from '../../domain/cierre.types';
import { formatearNumero } from '@/shared/lib/numeros';
import { useChoferesCombustible, useGuardarBorrador, useTelemetriaCierre } from '../../queries/hooks';
import { CLASE_TEXTAREA, ErrorBase, Seccion } from '../comun/ui';

type Salida = ReturnType<typeof borradorFormSchema.parse>;

/**
 * Datos del borrador que completa el usuario. Qué justificación hace falta y cuándo lo
 * indica la base en "Pendientes para aprobar"; al guardar, el resultado se recalcula.
 */
export function BorradorForm({ cierre }: { cierre: CierreViaje }) {
  const puedeEditar = useCan('combustible.cierre_viaje:editar');
  const guardar = useGuardarBorrador();
  const { data: choferes } = useChoferesCombustible();
  const { data: tel } = useTelemetriaCierre(cierre.id, cierre.estado === 'borrador');
  const [error, setError] = useState<ErrorAccion | null>(null);
  const [guardado, setGuardado] = useState(false);
  const form = useForm<BorradorFormEntrada, unknown, Salida>({
    resolver: zodResolver(borradorFormSchema),
    values: aFormularioBorrador(cierre.datos),
    resetOptions: { keepDirtyValues: true },
    mode: 'onTouched',
  });
  const { register, handleSubmit, formState } = form;
  const e = formState.errors;

  if (!puedeEditar) return null;

  const enviar = handleSubmit(async (d) => {
    setError(null);
    setGuardado(false);
    const r = await guardar.mutateAsync({
      id: cierre.id,
      versionFila: cierre.versionFila,
      ...d,
      choferResponsableId: d.choferResponsableId as ChoferId | null,
    });
    if (!r.ok) {
      setError(r.error);
      for (const [campo, mensaje] of Object.entries(r.error.campos ?? {})) {
        form.setError(campo as Path<BorradorFormEntrada>, { type: 'server', message: mensaje });
      }
      return;
    }
    setGuardado(true);
  });

  return (
    <form onSubmit={enviar} noValidate>
      <Seccion titulo="Datos del borrador">
        <ErrorBase error={error} onRecargar={() => form.reset(aFormularioBorrador(cierre.datos))} />

        <Bloque titulo="Responsable">
          <Campo label="Chofer responsable" error={e.choferResponsableId?.message}>
            <select {...register('choferResponsableId')}>
              <option value="">Sin asignar</option>
              {choferes?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Motivo (si no es el propuesto)" error={e.motivoChofer?.message}>
            <input {...register('motivoChofer')} />
          </Campo>
          <div className="space-y-1">
            <Campo label="Programador de velocidad (%)" error={e.programadorVelocidadPct?.message}>
              <input inputMode="decimal" {...register('programadorVelocidadPct')} />
            </Campo>
            {tel && (
              <p className="text-xs text-tinta-suave">
                {tel.programadorPct === null ? (
                  'La telemetría no tiene este dato para el viaje: cargalo a mano.'
                ) : (
                  <>
                    Telemetría: {formatearNumero(tel.programadorPct, 1)} %{' '}
                    <button
                      type="button"
                      className="text-marca hover:underline"
                      onClick={() => form.setValue('programadorVelocidadPct', String(tel.programadorPct).replace('.', ','), { shouldDirty: true })}
                    >
                      Usar
                    </button>
                  </>
                )}
              </p>
            )}
          </div>
          <Campo label="Test de alcohol" error={e.testAlcohol?.message} ayuda="Dato sensible.">
            <select {...register('testAlcohol')}>
              <option value="">Sin informar</option>
              {RESULTADOS_TEST_ALCOHOL.map((r) => (
                <option key={r} value={r}>
                  {ETIQUETA_TEST_ALCOHOL[r]}
                </option>
              ))}
            </select>
          </Campo>
        </Bloque>

        <Bloque titulo="Corregir la telemetría (solo si falta o está mal)">
          <Campo label="Km (manual)" error={e.kmManual?.message} {...(tel ? { ayuda: ayudaTelemetria(tel.km, tel.fuenteKm, 'km') } : {})}>
            <input inputMode="decimal" {...register('kmManual')} />
          </Campo>
          <Campo
            label="Consumo de plataforma (manual, L)"
            error={e.consumoPlataformaManualL?.message}
            {...(tel ? { ayuda: ayudaTelemetria(tel.consumoL, tel.fuenteConsumo, 'L') } : {})}
          >
            <input inputMode="decimal" {...register('consumoPlataformaManualL')} />
          </Campo>
          <Campo label="Motivo del ajuste" error={e.motivoAjuste?.message}>
            <input {...register('motivoAjuste')} />
          </Campo>
        </Bloque>

        <Bloque titulo="Diferencia justificada (no se descuenta al chofer)">
          <Campo label="Litros justificados" error={e.noImputableL?.message} ayuda="Parte de la diferencia que no es culpa del chofer (derrame, error del surtidor…). Se resta de lo que se le descuenta.">
            <input inputMode="decimal" placeholder="0" {...register('noImputableL')} />
          </Campo>
          <Campo label="Horas de ralentí justificadas" error={e.noImputableRalentiH?.message}>
            <input inputMode="decimal" placeholder="0" {...register('noImputableRalentiH')} />
          </Campo>
          <Campo label="Motivo" error={e.noImputableMotivo?.message}>
            <input {...register('noImputableMotivo')} />
          </Campo>
        </Bloque>
        <TextoLargo etiqueta="Comentario sobre la diferencia (opcional)" error={e.justificacion?.message}>
          <textarea rows={2} className={CLASE_TEXTAREA} {...register('justificacion')} />
        </TextoLargo>

        <TextoLargo etiqueta="Observaciones" error={e.observaciones?.message}>
          <textarea rows={3} className={CLASE_TEXTAREA} {...register('observaciones')} />
        </TextoLargo>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className={BOTON_PRIMARIO} disabled={guardar.isPending}>
            {guardar.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />} Guardar borrador
          </button>
          {guardado && !formState.isDirty && <span className="text-sm text-exito">Guardado. El resultado se recalculó.</span>}
        </div>
      </Seccion>
    </form>
  );
}

const FUENTE: Record<string, string> = {
  telemetria: 'telemetría',
  agregado_diario: 'resumen diario de la telemetría, aproximado',
  cargas: 'odómetro de las cargas',
  tramos: 'tramos operativos',
};

/** Migración 53: lo que toma el sistema sin ajuste manual, al lado de cada campo. */
function ayudaTelemetria(valor: number | null, fuente: string | null, unidad: string): string {
  if (valor === null || !fuente) return 'Sin dato de la telemetría: cargalo a mano, con el motivo.';
  return `El sistema toma ${formatearNumero(valor, unidad === 'km' ? 0 : 1)} ${unidad} (${FUENTE[fuente] ?? fuente}). Dejalo vacío salvo que esté mal.`;
}

function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium text-tinta-suave">{titulo}</legend>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
    </fieldset>
  );
}

function TextoLargo({ etiqueta, error, children }: { etiqueta: string; error?: string | undefined; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-sm font-medium text-tinta">{etiqueta}</span>
      {children}
      {error && <span className="block text-xs text-error">{error}</span>}
    </label>
  );
}
