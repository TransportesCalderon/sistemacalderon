'use client';

import { useState } from 'react';
import { CheckCircle2, Fuel, LoaderCircle, PencilLine, X } from 'lucide-react';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import type { CargaEnex, PendientesEnex } from '../../domain/enex.types';
import { useCorregirCargaEnex, useDescartarCargaEnex, usePendientesEnex, useRegistrarCargaEnex } from '../../queries/enex.hooks';

/**
 * Shell 02 · Arriba de Cargas: lo que informó Enex (tarjetas Shell Card) y todavía hay que resolver. Enex comanda:
 * la que nadie registró se registra con un clic con los datos de Enex; la que tiene otros números se corrige con los de Enex.
 * No aparece si no hay nada por resolver (o si la base todavía no tiene la integración).
 */
export function CargasShell() {
  const puede = useCan('combustible.cargas:editar');
  const { data } = usePendientesEnex(puede);
  if (!puede || !data || data.cargas.length === 0) return null;
  const faltan = data.cargas.filter((c) => c.situacion === 'falta_registrar').length;
  const difieren = data.cargas.length - faltan;
  return (
    <section className="mb-4 space-y-3 rounded-xl border-2 border-marca/40 bg-marca-suave/40 p-4">
      <p className="flex items-center gap-2 font-semibold text-tinta">
        <Fuel className="size-5 text-marca" /> Cargas de Shell Card para resolver ({data.cargas.length})
      </p>
      <p className="text-sm text-tinta-suave">
        Es lo que cobró Shell según Enex. {faltan > 0 && `${faltan} sin registrar. `}
        {difieren > 0 && `${difieren} con números distintos a los registrados. `}
        Vale el dato de Enex.
      </p>
      {data.cargas.map((c) => (
        <Fila key={c.id} c={c} datos={data} />
      ))}
    </section>
  );
}

function Fila({ c, datos }: { c: CargaEnex; datos: PendientesEnex }) {
  const { zonaHoraria } = useSesion();
  const registrar = useRegistrarCargaEnex();
  const corregir = useCorregirCargaEnex();
  const descartar = useDescartarCargaEnex();
  const [estacion, setEstacion] = useState<number | null>(c.estacionId);
  const [descartando, setDescartando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);
  const ocupado = registrar.isPending || corregir.isPending || descartar.isPending;

  if (hecho)
    return (
      <p className="flex items-center gap-2 rounded-lg bg-panel p-3 text-sm text-exito">
        <CheckCircle2 className="size-4" /> <span className="font-mono">{c.patente}</span> · {hecho}
      </p>
    );

  const correr = async (accion: Promise<{ ok: boolean; error?: { mensaje: string } }>, listo: string) => {
    setError(null);
    const r = await accion;
    if (!r.ok) setError(r.error?.mensaje ?? 'No se pudo hacer');
    else setHecho(listo);
  };

  return (
    <div className={cn(TARJETA, 'space-y-2 p-3')}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold text-tinta">
          <span className="font-mono">{c.patente}</span> · {formatearNumero(c.litros, 1)} L
          {c.precioClp !== null && <> · {formatearNumero(c.precioClp, 0)} CLP/L</>}
          {c.montoClp !== null && <> · {formatearNumero(c.montoClp, 0)} CLP</>}
        </p>
        <p className="text-xs text-tinta-suave">
          {formatearFechaHora(c.fechaHora, zonaHoraria)}
          {c.donde && <> · {c.donde}</>}
          {c.documento && <> · doc. {c.documento}</>}
        </p>
      </div>

      {c.situacion === 'difiere' ? (
        <p className="rounded-md bg-alerta/10 p-2 text-sm text-tinta">
          La carga #{c.cargaId} está registrada con otros números. {c.diferencia}
        </p>
      ) : !c.esTractor ? (
        <p className="rounded-md bg-alerta/10 p-2 text-sm text-tinta">
          Esa patente no es de un tractor del sistema (puede ser la tarjeta de un generador): no se registra como carga de tractor.
        </p>
      ) : (
        <label className="block text-sm text-tinta">
          Estación de servicio {c.estacionId === null && <span className="text-tinta-suave">(elegila esta vez; después el sistema la recuerda)</span>}
          <select
            value={estacion ?? ''}
            onChange={(e) => setEstacion(e.target.value ? Number(e.target.value) : null)}
            className="mt-1 h-11 w-full rounded-md border border-borde bg-panel px-3 text-base sm:w-80"
          >
            <option value="">Elegir…</option>
            {datos.estaciones.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
        </label>
      )}

      {error && <p className="text-sm text-error">{error}</p>}

      {descartando ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={motivo}
            maxLength={300}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="¿Por qué no se registra? (por ejemplo: es del generador)"
            className="h-11 min-w-0 flex-1 rounded-md border border-borde bg-panel px-3 text-base"
          />
          <button
            type="button"
            className={BOTON_SECUNDARIO}
            disabled={ocupado || motivo.trim().length < 5}
            onClick={() => void correr(descartar.mutateAsync({ id: c.id, motivo: motivo.trim() }), 'descartada.')}
          >
            Descartar
          </button>
          <button type="button" className={BOTON_SECUNDARIO} disabled={ocupado} onClick={() => setDescartando(false)}>
            Volver
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {c.situacion === 'difiere' ? (
            <button
              type="button"
              className={cn(BOTON_PRIMARIO, 'h-11')}
              disabled={ocupado}
              onClick={() => void correr(corregir.mutateAsync({ id: c.id }), 'carga corregida con los datos de Enex.')}
            >
              {corregir.isPending ? <LoaderCircle className="size-5 animate-spin" /> : <PencilLine className="size-5" />} Corregir con Enex
            </button>
          ) : (
            <>
              {c.esTractor && (
                <button
                  type="button"
                  className={cn(BOTON_PRIMARIO, 'h-11')}
                  disabled={ocupado || estacion === null}
                  onClick={() => void correr(registrar.mutateAsync({ id: c.id, estacionId: estacion }), 'carga registrada (sin tanque lleno).')}
                >
                  {registrar.isPending ? <LoaderCircle className="size-5 animate-spin" /> : <CheckCircle2 className="size-5" />} Registrar carga
                </button>
              )}
              <button type="button" className={BOTON_SECUNDARIO} disabled={ocupado} onClick={() => setDescartando(true)}>
                <X className="size-4" /> No corresponde
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
