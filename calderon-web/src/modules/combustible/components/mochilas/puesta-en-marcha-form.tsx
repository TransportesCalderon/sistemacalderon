'use client';

import { useState } from 'react';
import { useForm, type Path } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { LoaderCircle, Rocket } from 'lucide-react';
import type { ErrorAccion } from '@/server/actions/result';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { ETIQUETA_METODO, METODOS_MEDICION } from '../../domain/mochila.types';
import { puestaEnMarchaFormSchema, type PuestaEnMarchaFormEntrada } from '../../domain/mochila.schemas';
import { useCamionesCombustible, usePonerEnMarcha } from '../../queries/hooks';
import { ErrorBase } from '../comun/ui';
import { OpcionesParada } from './selector-parada';

type Salida = ReturnType<typeof puestaEnMarchaFormSchema.parse>;

const PASOS: Record<string, string> = { uso: 'uso de mochila', mochila: 'mochila', control_inicial: 'control inicial' };

/**
 * Puesta en marcha (TI): uso de mochila si falta, mochila con vigencia desde una parada
 * frontera y control inicial medido. Si un paso falla, repetir continúa donde quedó.
 */
export function PuestaEnMarchaForm({ camionId }: { camionId: number }) {
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<ErrorAccion | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);
  const { data: camiones } = useCamionesCombustible();
  const poner = usePonerEnMarcha();
  const form = useForm<PuestaEnMarchaFormEntrada, unknown, Salida>({
    resolver: zodResolver(puestaEnMarchaFormSchema),
    defaultValues: { paradaDesdeId: '', codigo: '', nombre: 'Mochila', capacidadL: '', litrosIniciales: '', metodo: 'varilla', observaciones: '' },
    mode: 'onTouched',
  });
  const { register, handleSubmit, formState } = form;
  const e = formState.errors;

  if (!abierto) {
    return (
      <div className="space-y-2">
        {hecho && <p className="text-sm text-exito">{hecho}</p>}
        <button type="button" className={BOTON_PRIMARIO} onClick={() => setAbierto(true)}>
          <Rocket className="size-4" /> Poner en marcha una mochila
        </button>
      </div>
    );
  }

  const enviar = handleSubmit(async (d) => {
    setError(null);
    const camion = camiones?.find((c) => c.id === camionId);
    if (!camion) {
      setError({ codigo: 'validacion', mensaje: 'No se encontró el camión.' });
      return;
    }
    const r = await poner.mutateAsync({
      camionId,
      tipoCombustibleId: camion.tipoCombustibleId,
      paradaDesdeId: d.paradaDesdeId ?? 0,
      codigo: d.codigo,
      nombre: d.nombre,
      capacidadL: d.capacidadL ?? 0,
      litrosIniciales: d.litrosIniciales ?? 0,
      metodo: d.metodo,
      observaciones: d.observaciones,
    });
    if (!r.ok) {
      setError(r.error);
      for (const [campo, mensaje] of Object.entries(r.error.campos ?? {})) {
        form.setError(campo as Path<PuestaEnMarchaFormEntrada>, { type: 'server', message: mensaje });
      }
      return;
    }
    setHecho(r.data.pasos.length ? `Listo: se registró ${r.data.pasos.map((p) => PASOS[p]).join(', ')}.` : 'Ya estaba todo registrado.');
    setAbierto(false);
    form.reset();
  });

  return (
    <form onSubmit={enviar} noValidate className="space-y-4 rounded-lg border border-borde p-4">
      <h3 className="font-medium text-tinta">Puesta en marcha de mochila</h3>
      <p className="text-sm text-tinta-suave">
        La vigencia empieza en una parada frontera del camión. El control inicial es la medición del saldo en ese momento.
      </p>
      <ErrorBase error={error} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Campo label="Parada frontera de inicio *" error={e.paradaDesdeId?.message}>
          <select {...register('paradaDesdeId')}>
            <OpcionesParada camionId={camionId} />
          </select>
        </Campo>
        <Campo label="Código *" error={e.codigo?.message}>
          <input {...register('codigo')} />
        </Campo>
        <Campo label="Nombre *" error={e.nombre?.message}>
          <input {...register('nombre')} />
        </Campo>
        <Campo label="Capacidad (L) *" error={e.capacidadL?.message}>
          <input inputMode="decimal" {...register('capacidadL')} />
        </Campo>
        <Campo label="Litros medidos al inicio *" error={e.litrosIniciales?.message}>
          <input inputMode="decimal" {...register('litrosIniciales')} />
        </Campo>
        <Campo label="Método *" error={e.metodo?.message}>
          <select {...register('metodo')}>
            {METODOS_MEDICION.map((m) => (
              <option key={m} value={m}>
                {ETIQUETA_METODO[m]}
              </option>
            ))}
          </select>
        </Campo>
      </div>
      <Campo label="Observaciones" error={e.observaciones?.message}>
        <input {...register('observaciones')} />
      </Campo>
      <div className="flex flex-wrap gap-3">
        <button type="submit" className={BOTON_PRIMARIO} disabled={poner.isPending}>
          {poner.isPending && <LoaderCircle className="size-4 animate-spin" />} Poner en marcha
        </button>
        <button type="button" className={BOTON_SECUNDARIO} onClick={() => setAbierto(false)} disabled={poner.isPending}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
