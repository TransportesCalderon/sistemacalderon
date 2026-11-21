'use client';

import { useState } from 'react';
import { Gauge, LoaderCircle, Send, X } from 'lucide-react';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, CONTROL_FILTRO } from '@/shared/ui/clases';
import type { PedidoTablero } from '../domain/pedido-tablero';
import { useAnularPedidoTablero, usePedirFotoTablero } from '../queries/pedido-tablero.hooks';

/** Migración 297 · En la fila del viaje (Seguimiento): cómo va la foto del tablero que pidió Telemetría. */
export function EstadoPedidoTablero({ pedido }: { pedido: PedidoTablero | null }) {
  if (!pedido) return null;
  return (
    <span className={cn('block', pedido.recibidoEn ? 'text-exito' : 'text-alerta')}>
      <Gauge className="mr-1 inline size-3" />
      {pedido.recibidoEn ? 'Foto del tablero recibida' : 'Foto del tablero pedida'}
    </span>
  );
}

/**
 * Migración 297 · Telemetría le pide la foto del tablero al chofer que maneja el camión (solo Mercedes y Scania). Le
 * llega el aviso al teléfono y lo ve en Mi viaje; si no la sube, no puede pedir dinero. Si ya hay un pedido sin
 * cumplir, no se repite: se le vuelve a avisar. La base decide quién puede y a qué camión.
 */
export function PedirFotoTablero({
  viajeId,
  pedido,
  dias,
  onCerrar,
}: {
  viajeId: number;
  pedido: PedidoTablero | null;
  dias: number;
  onCerrar: () => void;
}) {
  const { zonaHoraria } = useSesion();
  const pedir = usePedirFotoTablero();
  const anular = useAnularPedidoTablero();
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);
  const pendiente = pedido && !pedido.recibidoEn ? pedido : null;
  const ocupado = pedir.isPending || anular.isPending;

  return (
    <div className="space-y-2 rounded-md border border-borde p-3">
      <p className="flex items-center gap-2 text-sm font-medium text-tinta">
        <Gauge className="size-4 text-marca" /> Foto del tablero
      </p>
      {pendiente ? (
        <p className="text-sm text-tinta">
          Pedida a {pendiente.chofer ?? 'el chofer'} el {formatearFechaHora(pendiente.pedidoEn, zonaHoraria)}
          {pendiente.pedidoPor && ` por ${pendiente.pedidoPor}`}
          {pendiente.motivo && ` · ${pendiente.motivo}`}. Todavía no la subió: si no la sube, no puede pedir dinero.
        </p>
      ) : (
        <>
          {pedido?.recibidoEn && (
            <p className="text-sm text-exito">
              La que se pidió el {formatearFechaHora(pedido.pedidoEn, zonaHoraria)} llegó el {formatearFechaHora(pedido.recibidoEn, zonaHoraria)}.
            </p>
          )}
          <p className="text-sm text-tinta-suave">
            Al chofer le llega el aviso al teléfono y lo ve en Mi viaje. Si no la sube, no puede pedir dinero. El pedido vale {dias} días.
          </p>
        </>
      )}
      <input
        value={motivo}
        maxLength={300}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Para qué la necesitás (opcional; le llega al chofer)"
        aria-label="Para qué la necesitás"
        className={cn(CONTROL_FILTRO, 'h-10 w-full')}
      />
      {error && <p className="text-sm text-error">{error}</p>}
      {hecho && <p className="text-sm text-exito">{hecho}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={BOTON_PRIMARIO}
          disabled={ocupado}
          onClick={async () => {
            setError(null);
            setHecho(null);
            const r = await pedir.mutateAsync({ viajeId, motivo: motivo.trim() || null });
            if (!r.ok) {
              setError(r.error.mensaje);
              return;
            }
            setHecho(r.data.nuevo ? 'Pedida: se le avisó al chofer.' : 'Ya estaba pedida: se le volvió a avisar al chofer.');
            setMotivo('');
          }}
        >
          {pedir.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />} {pendiente ? 'Volver a avisar' : 'Pedir la foto'}
        </button>
        {pendiente && (
          <button
            type="button"
            className={BOTON_SECUNDARIO}
            disabled={ocupado}
            onClick={async () => {
              setError(null);
              setHecho(null);
              const r = await anular.mutateAsync({ id: pendiente.id });
              if (!r.ok) {
                setError(r.error.mensaje);
                return;
              }
              setHecho('Pedido cancelado.');
            }}
          >
            {anular.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <X className="size-4" />} Cancelar el pedido
          </button>
        )}
        <button type="button" className="text-sm text-marca hover:underline" onClick={onCerrar}>
          Cerrar
        </button>
      </div>
    </div>
  );
}
