'use client';

import { useState } from 'react';
import { Check, Scale, X } from 'lucide-react';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from '@/shared/ui/clases';
import { useEnvio } from '@/modules/catalogos/components/comun';
import type { Decision, DecisionCierre } from '../../domain/decision.types';
import {
  useDecidirDiferencia,
  useDecisionCierre,
  usePedirQuitarDescuento,
  useResolverQuitarDescuento,
  useRetirarQuitarDescuento,
} from '../../queries/hooks';
import { Chip, ErrorBase, Seccion } from '../comun/ui';

const AREA = 'w-full rounded-md border border-borde bg-panel px-3 py-2 text-sm outline-none focus:border-marca';

/**
 * Migración 185 · La diferencia del cierre se resuelve siempre: descontar al chofer o justificar (con
 * motivo y evidencia). La aprueba otra persona. Ya aprobado, quitar el descuento es un pedido que
 * resuelve otra persona habilitada. Las reglas las controla la base; acá solo se muestra su mensaje.
 */
export function DecisionDiferencia({ cierreId, estado, aDescontarL }: { cierreId: number; estado: string; aDescontarL: number | null }) {
  const { zonaHoraria } = useSesion();
  const { data } = useDecisionCierre(cierreId, estado !== 'anulado');
  if (estado === 'anulado' || !data) return null;
  const litros = estado === 'borrador' ? (aDescontarL ?? 0) : (data.aDescontarL ?? 0);
  const hayAlgo = litros > 0 || data.decision !== null || data.pedido !== null || (data.descuentoQuitadoL ?? 0) > 0;
  if (!hayAlgo) return null;

  return (
    <Seccion titulo="Qué se hace con la diferencia">
      {data.decision && (
        <div className="space-y-1 text-sm">
          <p>
            <Chip tono={data.decision === 'descontar' ? 'alerta' : 'exito'}>{data.decision === 'descontar' ? 'Se descuenta al chofer' : 'Justificada'}</Chip>{' '}
            <span className="text-tinta-suave">
              {data.por} · {formatearFechaHora(data.en, zonaHoraria)}
            </span>
          </p>
          {data.motivo && <p className="whitespace-pre-line">{data.motivo}</p>}
          {data.evidencia && (
            <p className="text-tinta-suave">
              <span className="font-medium">Evidencia:</span> {data.evidencia}
            </p>
          )}
        </div>
      )}
      {estado === 'aprobado' && (data.descuentoQuitadoL ?? 0) > 0 && (
        <p className="text-sm text-tinta-suave">Se quitó el descuento de {formatearNumero(data.descuentoQuitadoL ?? 0, 1)} L después de aprobar.</p>
      )}
      {estado === 'borrador' && litros > 0 && <Decidir cierreId={cierreId} litros={litros} actual={data} />}
      {estado === 'aprobado' && <QuitarDescuento cierreId={cierreId} data={data} zonaHoraria={zonaHoraria} />}
    </Seccion>
  );
}

function Decidir({ cierreId, litros, actual }: { cierreId: number; litros: number; actual: DecisionCierre }) {
  const decidir = useDecidirDiferencia();
  const envio = useEnvio();
  const [decision, setDecision] = useState<Decision | ''>(actual.decision ?? '');
  const [motivo, setMotivo] = useState(actual.motivo ?? '');
  const [evidencia, setEvidencia] = useState(actual.evidencia ?? '');
  return (
    <div className="space-y-3 border-t border-borde pt-3">
      <p className="text-sm">
        Faltan <strong>{formatearNumero(litros, 1)} L</strong>. Para aprobar el cierre hay que decidir. La aprueba otra persona (no quien decide).
      </p>
      <div className="flex flex-wrap gap-4 text-sm">
        {(['descontar', 'justificar'] as const).map((d) => (
          <label key={d} className="inline-flex items-center gap-2">
            <input type="radio" name={`decision-${cierreId}`} className="accent-marca" checked={decision === d} onChange={() => setDecision(d)} />
            {d === 'descontar' ? `Descontar ${formatearNumero(litros, 1)} L al chofer` : 'Justificar (no se descuenta)'}
          </label>
        ))}
      </div>
      {decision === 'justificar' && (
        <div className="grid gap-2 sm:grid-cols-2">
          <textarea className={AREA} rows={2} placeholder="Motivo (por qué no se descuenta)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <textarea
            className={AREA}
            rows={2}
            placeholder="Evidencia: foto del tablero, alerta, ralentí, viento, ticket…"
            value={evidencia}
            onChange={(e) => setEvidencia(e.target.value)}
          />
        </div>
      )}
      {decision === 'descontar' && (
        <textarea className={AREA} rows={2} placeholder="Comentario (opcional)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      )}
      <ErrorBase error={envio.error} />
      <button
        type="button"
        className={BOTON_PRIMARIO}
        disabled={!decision || decidir.isPending}
        onClick={() =>
          void envio.enviar(
            decidir.mutateAsync({
              cierreId,
              decision: decision || null,
              motivo: motivo.trim() || null,
              evidencia: decision === 'justificar' ? evidencia.trim() || null : null,
            }),
            () => undefined,
          )
        }
      >
        <Scale className="size-4" /> Guardar la decisión
      </button>
    </div>
  );
}

function QuitarDescuento({ cierreId, data, zonaHoraria }: { cierreId: number; data: DecisionCierre; zonaHoraria: string }) {
  const pedir = usePedirQuitarDescuento();
  const resolver = useResolverQuitarDescuento();
  const retirar = useRetirarQuitarDescuento();
  const envio = useEnvio();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [evidencia, setEvidencia] = useState('');
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const p = data.pedido;
  const pendiente = p?.estado === 'pendiente';

  return (
    <div className="space-y-3 border-t border-borde pt-3 text-sm">
      {p && (
        <div className={cn('space-y-1 rounded-md border p-3', pendiente ? 'border-alerta/40 bg-alerta-suave/40' : 'border-borde')}>
          <p>
            Pedido para quitar el descuento de <strong>{formatearNumero(p.litros, 1)} L</strong>:{' '}
            <Chip tono={pendiente ? 'alerta' : p.estado === 'aprobada' ? 'exito' : 'neutro'}>{p.estado}</Chip>
          </p>
          <p className="text-tinta-suave">
            Lo pidió {p.por} · {formatearFechaHora(p.en, zonaHoraria)}
            {p.resueltoPor && ` · resolvió ${p.resueltoPor}`}
          </p>
          <p>{p.motivo}</p>
          <p className="text-tinta-suave">
            <span className="font-medium">Evidencia:</span> {p.evidencia}
          </p>
          {p.motivoResolucion && <p className="text-tinta-suave">Respuesta: {p.motivoResolucion}</p>}
          {pendiente && p.puedoResolver && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                className={BOTON_PRIMARIO}
                disabled={resolver.isPending}
                onClick={() => void envio.enviar(resolver.mutateAsync({ cierreId, pedidoId: p.id, aprobar: true, motivo: null }), () => undefined)}
              >
                <Check className="size-4" /> Aprobar: quitar el descuento
              </button>
              <input className={cn(AREA, 'w-64')} placeholder="Motivo para rechazar" value={motivoRechazo} onChange={(e) => setMotivoRechazo(e.target.value)} />
              <button
                type="button"
                className={BOTON_SECUNDARIO}
                disabled={resolver.isPending}
                onClick={() =>
                  void envio.enviar(resolver.mutateAsync({ cierreId, pedidoId: p.id, aprobar: false, motivo: motivoRechazo.trim() || null }), () => undefined)
                }
              >
                <X className="size-4" /> Rechazar
              </button>
            </div>
          )}
          {pendiente && p.esMio && (
            <button
              type="button"
              className="text-xs text-tinta-suave hover:text-error"
              disabled={retirar.isPending}
              onClick={() => void envio.enviar(retirar.mutateAsync({ cierreId, pedidoId: p.id }), () => undefined)}
            >
              Retirar el pedido
            </button>
          )}
        </div>
      )}
      {(data.aDescontarL ?? 0) > 0 && !pendiente && (
        abierto ? (
          <div className="space-y-2">
            <p>
              Se descuentan <strong>{formatearNumero(data.aDescontarL ?? 0, 1)} L</strong> al chofer. Para quitarlo hace falta el motivo, la evidencia y que lo
              apruebe otra persona habilitada para aprobar cierres.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <textarea className={AREA} rows={2} placeholder="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
              <textarea className={AREA} rows={2} placeholder="Evidencia" value={evidencia} onChange={(e) => setEvidencia(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className={BOTON_PRIMARIO}
                disabled={pedir.isPending}
                onClick={() => void envio.enviar(pedir.mutateAsync({ cierreId, motivo, evidencia }), () => setAbierto(false))}
              >
                Pedir quitar el descuento
              </button>
              <button type="button" className={BOTON_SECUNDARIO} onClick={() => setAbierto(false)}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="text-sm text-marca hover:underline" onClick={() => setAbierto(true)}>
            Pedir quitar el descuento de {formatearNumero(data.aDescontarL ?? 0, 1)} L
          </button>
        )
      )}
      <ErrorBase error={envio.error} />
    </div>
  );
}
