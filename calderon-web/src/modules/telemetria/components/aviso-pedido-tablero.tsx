'use client';

import Link from 'next/link';
import { Gauge } from 'lucide-react';
import { useSesion } from '@/modules/core/session/session-provider';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { VERSION_PEDIDO_TABLERO } from '../domain/pedido-tablero';
import { useMisPedidosTablero } from '../queries/pedido-tablero.hooks';

const CLASE = 'flex items-start gap-3 rounded-xl border-2 border-alerta bg-alerta-suave p-4';

/**
 * Migración 297 · Al chofer: Telemetría le pidió la foto del tablero (solo Mercedes y Scania) y todavía no la subió.
 * Reemplaza al aviso de la 224 (fotos en cada llenado de corte, para todos los camiones). Si no la sube, la base no lo
 * deja pedir dinero. En la pantalla del tablero va sin enlace (ya está ahí).
 */
export function AvisoPedidoTablero({ conEnlace = true }: { conEnlace?: boolean }) {
  const { zonaHoraria } = useSesion();
  const hay = useBaseTiene(VERSION_PEDIDO_TABLERO);
  const { data } = useMisPedidosTablero(hay);
  if (!hay || !data || data.length === 0) return null;
  const contenido = (
    <>
      <Gauge className="mt-0.5 size-6 shrink-0 text-alerta" />
      <span className="text-sm text-tinta">
        <strong className="block text-alerta">Telemetría te pide la foto del tablero</strong>
        {data.map((p) => (
          <span key={p.id} className="block">
            Del {p.patente}, pedida el {formatearFechaHora(p.pedidoEn, zonaHoraria)}
            {p.motivo && ` · ${p.motivo}`}.
          </span>
        ))}
        Sacá las fotos, revisá los números y guardá. Si no la subís, no vas a poder pedir dinero.
      </span>
    </>
  );
  return conEnlace ? (
    <Link href="/mi-viaje?ver=tablero" className={CLASE}>
      {contenido}
    </Link>
  ) : (
    <div className={CLASE}>{contenido}</div>
  );
}
