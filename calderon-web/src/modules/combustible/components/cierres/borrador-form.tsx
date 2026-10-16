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
import { useChoferesCombustible, useGuardarBorrador } from '../../queries/hooks';
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
          <Campo label="Programador de velocidad (%)" error={e.programadorVelocidadPct?.message}>
            <input inputMode="decimal" {...register('programadorVelocidadPct')} />
          </Campo>
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

        <Bloque titulo="Ajustes manuales de plataforma">
          <Campo label="Km (manual)" error={e.kmManual?.message}>
            <input inputMode="decimal" {...register('kmManual')} />
          </Campo>
          <Campo label="Consumo de plataforma (manual, L)" error={e.consumoPlataformaManualL?.message}>
            <input inputMode="decimal" {...register('consumoPlataformaManualL')} />
          </Campo>
          <Campo label="Motivo del ajuste" error={e.motivoAjuste?.message}>
            <input {...register('motivoAjuste')} />
          </Campo>
        </Bloque>

        <Bloque titulo="Tractor: no imputable">
          <Campo label="Litros no imputables" error={e.tractorNoImputableL?.message}>
            <input inputMode="decimal" placeholder="0" {...register('tractorNoImputableL')} />
          </Campo>
          <Campo label="Horas de ralentí no imputables" error={e.tractorNoImputableRalentiH?.message}>
            <input inputMode="decimal" placeholder="0" {...register('tractorNoImputableRalentiH')} />
          </Campo>
          <Campo label="Motivo" error={e.tractorNoImputableMotivo?.message}>
            <input {...register('tractorNoImputableMotivo')} />
          </Campo>
        </Bloque>
        <TextoLargo etiqueta="Justificación de la diferencia del tractor" error={e.tractorJustificacion?.message}>
          <textarea rows={2} className={CLASE_TEXTAREA} {...register('tractorJustificacion')} />
        </TextoLargo>

        <Bloque titulo="Mochila: no imputable">
          <Campo label="Litros no imputables" error={e.mochilaNoImputableL?.message}>
            <input inputMode="decimal" placeholder="0" {...register('mochilaNoImputableL')} />
          </Campo>
          <Campo label="Motivo" error={e.mochilaNoImputableMotivo?.message}>
            <input {...register('mochilaNoImputableMotivo')} />
          </Campo>
        </Bloque>
        <TextoLargo etiqueta="Justificación de la diferencia de la mochila" error={e.mochilaJustificacion?.message}>
          <textarea rows={2} className={CLASE_TEXTAREA} {...register('mochilaJustificacion')} />
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
