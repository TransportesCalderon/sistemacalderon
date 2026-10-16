'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm, type Path } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Gauge, LoaderCircle, Plus, Replace } from 'lucide-react';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import type { ErrorAccion } from '@/server/actions/result';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora, horaLocalAIso, isoAHoraLocal } from '@/shared/lib/fechas';
import { conUnidad } from '@/shared/lib/numeros';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { controlFormSchema, type ControlFormEntrada } from '../../domain/mochila.schemas';
import {
  DECLARANTES,
  ETIQUETA_DECLARANTE,
  ETIQUETA_FUENTE,
  ETIQUETA_METODO,
  ETIQUETA_ROL_CONTROL,
  FUENTES_CONTROL,
  METODOS_MEDICION,
  type ControlSaldo,
  type FuenteControl,
  type MetodoMedicion,
  type Mochila,
  type RolControl,
} from '../../domain/mochila.types';
import { useChoferesCombustible, useControles, useRegistrarControl } from '../../queries/hooks';
import { Cargando, Chip, DiferenciaL, ErrorBase, ErrorLectura, Seccion, Vacio, type Tono } from '../comun/ui';
import { OpcionesParada } from './selector-parada';

type Salida = ReturnType<typeof controlFormSchema.parse>;

const TONO_ROL: Record<RolControl, Tono> = { inicial: 'marca', llegada: 'exito', intermedio: 'neutro', base: 'alerta' };

/** Controles de saldo de una mochila: lista (inicial / de frontera / intermedio) y alta o reemplazo. */
export function ControlesMochila({ camionId, mochila }: { camionId: number; mochila: Mochila }) {
  const { zonaHoraria } = useSesion();
  const puedeEditar = useCan('combustible.depositos:editar');
  const { data, isPending, isError, refetch } = useControles(mochila.id);
  const { data: choferes } = useChoferesCombustible();
  const nombreChofer = (id: number | null) => (id ? (choferes?.find((c) => c.id === id)?.nombre ?? `#${id}`) : null);
  const [form, setForm] = useState<{ reemplaza: ControlSaldo | null } | null>(null);

  return (
    <Seccion
      titulo={`Controles de ${mochila.codigo}`}
      acciones={
        puedeEditar &&
        !form && (
          <button type="button" className={BOTON_SECUNDARIO} onClick={() => setForm({ reemplaza: null })}>
            <Plus className="size-4" /> Registrar control
          </button>
        )
      }
    >
      {form && <ControlForm key={form.reemplaza?.id ?? 'nuevo'} camionId={camionId} mochila={mochila} reemplaza={form.reemplaza} onCerrar={() => setForm(null)} />}

      {isError ? (
        <ErrorLectura texto="No se pudieron cargar los controles." onReintentar={() => refetch()} />
      ) : isPending ? (
        <Cargando texto="Cargando controles…" />
      ) : data.length === 0 ? (
        <Vacio icono={<Gauge className="size-6" />} texto="La mochila no tiene controles." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="border-b border-borde text-left text-xs font-medium tracking-wide text-tinta-suave uppercase">
              <tr>
                <th className="px-2 py-2">Fecha y hora</th>
                <th className="px-2 py-2">Tipo</th>
                <th className="px-2 py-2 text-right">Litros</th>
                <th className="px-2 py-2 text-right">Libro al registrar</th>
                <th className="px-2 py-2 text-right">Diferencia</th>
                <th className="px-2 py-2">Fuente</th>
                <th className="px-2 py-2">Depósito</th>
                <th className="px-2 py-2">Observaciones</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {data.map((c) => (
                <tr key={c.id} className={cn(c.estado !== 'vigente' && 'text-tinta-suave line-through decoration-tinta-suave/40')}>
                  <td className="px-2 py-2 whitespace-nowrap tabular-nums">
                    {formatearFechaHora(c.fechaHora, zonaHoraria)}
                    {c.cargaParadaId && (
                      <Link href={`/combustible/cargas/${c.cargaParadaId}`} className="ml-1 text-xs text-marca no-underline hover:underline">
                        parada #{c.cargaParadaId}
                      </Link>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <span className="inline-flex flex-wrap gap-1 no-underline">
                      <Chip tono={TONO_ROL[c.rol]}>{ETIQUETA_ROL_CONTROL[c.rol]}</Chip>
                      {c.estado !== 'vigente' && <Chip tono="neutro">Reemplazado</Chip>}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right font-medium tabular-nums">{conUnidad(c.litros, 'L')}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{conUnidad(c.saldoLibroL, 'L')}</td>
                  <td className="px-2 py-2 text-right">
                    <DiferenciaL litros={c.diferenciaL} />
                  </td>
                  <td className="px-2 py-2">
                    {ETIQUETA_FUENTE[c.fuente as FuenteControl] ?? c.fuente}
                    {c.metodo && <span className="text-tinta-suave"> · {ETIQUETA_METODO[c.metodo as MetodoMedicion] ?? c.metodo}</span>}
                    {c.declaranteTipo && <span className="text-tinta-suave"> · {c.declaranteTipo}</span>}
                    {nombreChofer(c.choferId) && <span className="block text-xs text-tinta-suave">{nombreChofer(c.choferId)}</span>}
                  </td>
                  <td className="px-2 py-2 font-mono">{mochila.codigo}</td>
                  <td className="max-w-64 px-2 py-2">
                    {c.observaciones}
                    {c.motivoReemplazo && <span className="block text-xs">Reemplazo: {c.motivoReemplazo}</span>}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {puedeEditar && c.estado === 'vigente' && c.rol !== 'base' && (
                      <button type="button" className="inline-flex items-center gap-1 text-marca hover:underline" onClick={() => setForm({ reemplaza: c })}>
                        <Replace className="size-3.5" /> Reemplazar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Seccion>
  );
}

/**
 * Alta de control de saldo. De frontera: va ligado a una parada (la base fija la hora justo
 * antes de la parada). Intermedio: lleva fecha y hora. Reemplazo: mismo tipo, con motivo.
 */
function ControlForm({ camionId, mochila, reemplaza, onCerrar }: { camionId: number; mochila: Mochila; reemplaza: ControlSaldo | null; onCerrar: () => void }) {
  const { zonaHoraria } = useSesion();
  const registrar = useRegistrarControl();
  const { data: choferes } = useChoferesCombustible();
  const [error, setError] = useState<ErrorAccion | null>(null);
  const esInicial = reemplaza?.rol === 'inicial';

  const form = useForm<ControlFormEntrada, unknown, Salida>({
    resolver: zodResolver(controlFormSchema),
    defaultValues: {
      tipo: reemplaza?.rol === 'intermedio' ? 'intermedio' : 'llegada',
      cargaParadaId: reemplaza?.cargaParadaId ? String(reemplaza.cargaParadaId) : '',
      fechaHoraLocal: isoAHoraLocal(reemplaza?.fechaHora ?? new Date().toISOString(), zonaHoraria),
      litros: '',
      fuente: 'medicion',
      metodo: 'varilla',
      declaranteTipo: '',
      choferId: '',
      observaciones: '',
      motivoReemplazo: '',
    },
    mode: 'onTouched',
  });
  const { register, handleSubmit, watch, formState } = form;
  const e = formState.errors;
  const tipo = watch('tipo');
  const fuente = watch('fuente');

  const enviar = handleSubmit(async (d) => {
    setError(null);
    const fechaHora = d.tipo === 'intermedio' && !esInicial ? horaLocalAIso(d.fechaHoraLocal, zonaHoraria) : null;
    const r = await registrar.mutateAsync({
      depositoId: mochila.id,
      rol: esInicial ? 'inicial' : d.tipo,
      cargaParadaId: esInicial || d.tipo === 'llegada' ? d.cargaParadaId : null,
      fechaHora,
      litros: d.litros ?? 0,
      fuente: d.fuente,
      metodo: d.metodo === '' ? null : d.metodo,
      declaranteTipo: d.declaranteTipo === '' ? null : d.declaranteTipo,
      choferId: d.choferId,
      observaciones: d.observaciones,
      reemplazaId: reemplaza?.id ?? null,
      motivoReemplazo: d.motivoReemplazo,
    });
    if (!r.ok) {
      setError(r.error);
      for (const [campo, mensaje] of Object.entries(r.error.campos ?? {})) {
        form.setError(campo as Path<ControlFormEntrada>, { type: 'server', message: mensaje });
      }
      return;
    }
    onCerrar();
  });

  return (
    <form onSubmit={enviar} noValidate className="space-y-4 rounded-lg border border-borde p-4">
      <h3 className="font-medium text-tinta">
        {reemplaza
          ? `Reemplazar control ${ETIQUETA_ROL_CONTROL[reemplaza.rol].toLowerCase()} del ${formatearFechaHora(reemplaza.fechaHora, zonaHoraria)}`
          : `Nuevo control de ${mochila.codigo}`}
      </h3>
      <ErrorBase error={error} />

      {!reemplaza && (
        <fieldset className="flex flex-wrap gap-4 text-sm">
          <legend className="sr-only">Tipo de control</legend>
          <label className="flex items-center gap-2">
            <input type="radio" value="llegada" className="accent-marca" {...register('tipo')} /> En el corte de viaje (al llegar, antes de cargar)
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" value="intermedio" className="accent-marca" {...register('tipo')} /> Intermedio (referencia dentro del viaje)
          </label>
        </fieldset>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {esInicial || tipo === 'llegada' ? (
          <Campo label="Corte de viaje *" error={e.cargaParadaId?.message}>
            <select {...register('cargaParadaId')}>
              <OpcionesParada camionId={camionId} />
            </select>
          </Campo>
        ) : (
          <Campo label="Fecha y hora *" error={e.fechaHoraLocal?.message} ayuda={`Hora de ${zonaHoraria}`}>
            <input type="datetime-local" {...register('fechaHoraLocal')} />
          </Campo>
        )}
        <Campo label="Litros *" error={e.litros?.message}>
          <input inputMode="decimal" {...register('litros')} />
        </Campo>
        <Campo label="Fuente *" error={e.fuente?.message}>
          <select {...register('fuente')}>
            {FUENTES_CONTROL.map((f) => (
              <option key={f} value={f}>
                {ETIQUETA_FUENTE[f]}
              </option>
            ))}
          </select>
        </Campo>
        {fuente === 'medicion' ? (
          <Campo label="Método" error={e.metodo?.message}>
            <select {...register('metodo')}>
              <option value="">Sin informar</option>
              {METODOS_MEDICION.map((m) => (
                <option key={m} value={m}>
                  {ETIQUETA_METODO[m]}
                </option>
              ))}
            </select>
          </Campo>
        ) : (
          <Campo label="Declarado por" error={e.declaranteTipo?.message}>
            <select {...register('declaranteTipo')}>
              <option value="">Sin informar</option>
              {DECLARANTES.map((d) => (
                <option key={d} value={d}>
                  {ETIQUETA_DECLARANTE[d]}
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
      </div>
      <Campo label="Observaciones" error={e.observaciones?.message}>
        <input {...register('observaciones')} />
      </Campo>
      {reemplaza && (
        <Campo label="Motivo del reemplazo *" error={e.motivoReemplazo?.message}>
          <input {...register('motivoReemplazo')} />
        </Campo>
      )}
      <div className="flex flex-wrap gap-3">
        <button type="submit" className={BOTON_PRIMARIO} disabled={registrar.isPending}>
          {registrar.isPending && <LoaderCircle className="size-4 animate-spin" />} {reemplaza ? 'Reemplazar control' : 'Registrar control'}
        </button>
        <button type="button" className={BOTON_SECUNDARIO} onClick={onCerrar} disabled={registrar.isPending}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
