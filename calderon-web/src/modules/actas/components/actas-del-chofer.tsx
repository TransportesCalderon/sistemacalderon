'use client';

import Link from 'next/link';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { ETIQUETA_ESTADO_ACTA, ETIQUETA_TIPO_ACTA, TIPOS_ACTA, VERSION_ACTAS } from '../domain/acta.types';
import { useActas } from '../queries/hooks';

/** Migración 122 · El historial de actas de infracción en la ficha del chofer: cuántas de cada tipo y las últimas. */
export function ActasDelChofer({ choferId }: { choferId: number }) {
  const ve = useCan('operacion.actas:ver');
  const hay = useBaseTiene(VERSION_ACTAS);
  const { zonaHoraria } = useSesion();
  const { data, isPending, isError } = useActas({ desde: null, hasta: null, choferId, tipo: null }, ve && hay);
  if (!ve || !hay) return null;
  return (
    <section className="space-y-2 rounded-xl border border-borde bg-panel p-4">
      <h2 className="font-semibold text-tinta">Actas de infracción</h2>
      {isPending ? (
        <p className="text-sm text-tinta-suave">Leyendo…</p>
      ) : isError ? (
        <p className="text-sm text-error">No se pudieron leer las actas.</p>
      ) : data.actas.length === 0 ? (
        <p className="text-sm text-tinta-suave">No tiene actas.</p>
      ) : (
        <>
          <p className="text-sm text-tinta">
            {TIPOS_ACTA.map((t) => `${data.porTipo?.[t] ?? 0} de ${ETIQUETA_TIPO_ACTA[t].toLowerCase()}`).join(' · ')}
          </p>
          <ul className="divide-y divide-borde text-sm">
            {data.actas.slice(0, 5).map((a) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                <span>
                  <span className="font-mono">{a.numero}</span> · {ETIQUETA_TIPO_ACTA[a.tipo]}
                  <span className="text-tinta-suave"> · {ETIQUETA_ESTADO_ACTA[a.estado]}</span>
                </span>
                <span className="text-tinta-suave">{formatearFechaHora(a.fecha, zonaHoraria)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <Link href={`/actas?chofer=${choferId}`} className="text-sm text-marca hover:underline">
        Ver todas sus actas
      </Link>
    </section>
  );
}
