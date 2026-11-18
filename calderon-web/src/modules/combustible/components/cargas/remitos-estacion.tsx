'use client';

import { useState } from 'react';
import { CheckCircle2, FileText, LoaderCircle, PencilLine, ReceiptText, X } from 'lucide-react';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import type { PendientesRemitos, RemitoEstacion } from '../../domain/remitos.types';
import { abrirPdfRemito, useCorregirConRemito, useDescartarRemito, usePendientesRemitos, useRegistrarRemito } from '../../queries/remitos.hooks';

/**
 * Migración 277 · Arriba de Cargas: los remitos que mandó la estación por mail (Shell Rodríguez Peña) y no cuadran con
 * la carga del chofer. Se propone corregir la carga con el remito o registrarla; una persona confirma. Los que coinciden
 * no aparecen. Si la casilla no se pudo leer, se avisa acá.
 */
export function RemitosEstacion() {
  const puede = useCan('combustible.cargas:editar');
  const hay = useBaseTiene(277);
  const { data } = usePendientesRemitos(puede && hay);
  if (!puede || !hay || !data) return null;
  const fallaCasilla = data.activo && data.ultimaConsulta !== null && !data.ultimaConsulta.ok;
  if (data.remitos.length === 0 && !fallaCasilla) return null;
  return (
    <section className="mb-4 space-y-3 rounded-xl border-2 border-marca/40 bg-marca-suave/40 p-4">
      <p className="flex items-center gap-2 font-semibold text-tinta">
        <ReceiptText className="size-5 text-marca" /> Remitos de estaciones para resolver ({data.remitos.length})
      </p>
      <p className="text-sm text-tinta-suave">
        Llegan por mail y los lee Iris. Se comparan con la carga del chofer: litros (desde 0,02 L) y precio por litro. Vale el remito.
        {data.coinciden30Dias > 0 && ` ${data.coinciden30Dias} coincidieron en los últimos 30 días.`}
        {data.esperandoChofer > 0 && ` ${data.esperandoChofer} esperan que el chofer registre la carga.`}
        {data.leyendo > 0 && ` Iris está leyendo ${data.leyendo}.`}
      </p>
      {fallaCasilla && (
        <p className="rounded-md bg-error/10 p-2 text-sm text-error">No se pudo leer la casilla de mail: {data.ultimaConsulta?.mensaje ?? 'sin detalle'}. Avisale a TI.</p>
      )}
      {data.remitos.map((r) => (
        <Fila key={r.id} r={r} datos={data} />
      ))}
    </section>
  );
}

function Fila({ r, datos }: { r: RemitoEstacion; datos: PendientesRemitos }) {
  const { zonaHoraria } = useSesion();
  const registrar = useRegistrarRemito();
  const corregir = useCorregirConRemito();
  const descartar = useDescartarRemito();
  const [estacion, setEstacion] = useState<number | null>(r.estacionId);
  const [descartando, setDescartando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);
  const ocupado = registrar.isPending || corregir.isPending || descartar.isPending;

  if (hecho)
    return (
      <p className="flex items-center gap-2 rounded-lg bg-panel p-3 text-sm text-exito">
        <CheckCircle2 className="size-4" /> Remito {r.numero ?? r.archivo} · {hecho}
      </p>
    );

  const correr = async (accion: Promise<{ ok: boolean; error?: { mensaje: string } }>, listo: string) => {
    setError(null);
    const res = await accion;
    if (!res.ok) setError(res.error?.mensaje ?? 'No se pudo hacer');
    else setHecho(listo);
  };

  return (
    <div className={cn(TARJETA, 'space-y-2 p-3')}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold text-tinta">
          {r.patente ? <span className="font-mono">{r.patente}</span> : 'Sin patente'}
          {r.litros !== null && <> · {formatearNumero(r.litros, 3)} L</>}
          {r.precio !== null && <> · {formatearNumero(r.precio, 2)} {r.moneda}/L</>}
          {r.total !== null && <> · {formatearNumero(r.total, 2)} {r.moneda}</>}
        </p>
        <p className="text-xs text-tinta-suave">
          Remito {r.numero ?? '¿?'}
          {r.fechaHora && <> · {formatearFechaHora(r.fechaHora, zonaHoraria)}</>}
          {r.estacion && <> · {r.estacion}</>}
          {r.chofer && <> · {r.chofer}</>}
        </p>
      </div>

      {r.situacion === 'no_se_leyo' ? (
        <p className="rounded-md bg-alerta/10 p-2 text-sm text-tinta">Iris no pudo leer este remito: {r.error ?? 'sin detalle'}. Miralo y cargá la carga a mano si hace falta.</p>
      ) : r.situacion === 'difiere' ? (
        <p className="rounded-md bg-alerta/10 p-2 text-sm text-tinta">
          La carga #{r.cargaId} está registrada con otros números. {r.diferencia}
        </p>
      ) : !r.esTractor ? (
        <p className="rounded-md bg-alerta/10 p-2 text-sm text-tinta">
          No hay carga de ese tractor a esa hora y la patente {r.patente ?? ''} no es de un tractor del sistema: no se puede registrar como carga.
        </p>
      ) : (
        <>
          <p className="text-sm text-tinta">No hay ninguna carga de ese tractor a esa hora: se puede registrar con los datos del remito.</p>
          <label className="block text-sm text-tinta">
            Estación de servicio {r.estacionId === null && <span className="text-tinta-suave">(elegila esta vez; después el sistema la recuerda)</span>}
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
        </>
      )}
      {r.avisos && <p className="text-xs text-alerta">Ojo: {r.avisos}</p>}

      {error && <p className="text-sm text-error">{error}</p>}

      {descartando ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={motivo}
            maxLength={300}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="¿Por qué no corresponde? (por ejemplo: carga de otra empresa)"
            className="h-11 min-w-0 flex-1 rounded-md border border-borde bg-panel px-3 text-base"
          />
          <button
            type="button"
            className={BOTON_SECUNDARIO}
            disabled={ocupado || motivo.trim().length < 5}
            onClick={() => void correr(descartar.mutateAsync({ id: r.id, motivo: motivo.trim() }), 'quedó como «no corresponde».')}
          >
            Confirmar
          </button>
          <button type="button" className={BOTON_SECUNDARIO} disabled={ocupado} onClick={() => setDescartando(false)}>
            Volver
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {r.situacion === 'difiere' && (
            <button
              type="button"
              className={cn(BOTON_PRIMARIO, 'h-11')}
              disabled={ocupado}
              onClick={() => void correr(corregir.mutateAsync({ id: r.id }), 'carga corregida con los datos del remito.')}
            >
              {corregir.isPending ? <LoaderCircle className="size-5 animate-spin" /> : <PencilLine className="size-5" />} Corregir con el remito
            </button>
          )}
          {r.situacion === 'falta_registrar' && r.esTractor && (
            <button
              type="button"
              className={cn(BOTON_PRIMARIO, 'h-11')}
              disabled={ocupado || estacion === null}
              onClick={() => void correr(registrar.mutateAsync({ id: r.id, estacionId: estacion }), 'carga registrada con los datos del remito.')}
            >
              {registrar.isPending ? <LoaderCircle className="size-5 animate-spin" /> : <CheckCircle2 className="size-5" />} Registrar carga
            </button>
          )}
          <button
            type="button"
            className={BOTON_SECUNDARIO}
            onClick={async () => {
              const e = await abrirPdfRemito(r.id);
              if (e) setError(e);
            }}
          >
            <FileText className="size-4" /> Ver remito
          </button>
          <button type="button" className={BOTON_SECUNDARIO} disabled={ocupado} onClick={() => setDescartando(true)}>
            <X className="size-4" /> No corresponde
          </button>
        </div>
      )}
    </div>
  );
}
