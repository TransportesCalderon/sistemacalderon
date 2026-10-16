'use client';

import Link from 'next/link';
import { Container } from 'lucide-react';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { conUnidad } from '@/shared/lib/numeros';
import { TARJETA } from '@/shared/ui/clases';
import { useCamionesMochila } from '../../queries/hooks';
import { Cargando, Chip, Encabezado, ErrorLectura, Vacio } from '../comun/ui';

/** Combustible > Mochilas y controles: cada camión con su uso, su mochila vigente y el saldo que calcula la base. */
export function MochilasLista() {
  const { zonaHoraria } = useSesion();
  const { data, isPending, isError, refetch } = useCamionesMochila();

  return (
    <div className="space-y-5">
      <Encabezado titulo="Mochilas y controles" />
      <section className={cn(TARJETA, 'overflow-hidden')}>
        {isError ? (
          <ErrorLectura texto="No se pudo cargar la lista de camiones." onReintentar={() => refetch()} />
        ) : isPending ? (
          <Cargando texto="Cargando camiones…" />
        ) : data.length === 0 ? (
          <Vacio icono={<Container className="size-6" />} texto="No hay camiones activos." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="border-b border-borde bg-fondo text-left text-xs font-medium tracking-wide text-tinta-suave uppercase">
                <tr>
                  <th className="px-3 py-2.5">Camión</th>
                  <th className="px-3 py-2.5">Uso de mochila</th>
                  <th className="px-3 py-2.5">Mochila vigente</th>
                  <th className="px-3 py-2.5 text-right">Saldo de libro</th>
                  <th className="px-3 py-2.5">Último control</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {data.map((c) => (
                  <tr key={c.camionId} className="hover:bg-hover">
                    <td className="px-3 py-2.5">
                      <Link href={`/combustible/mochilas/${c.camionId}`} className="text-marca hover:underline">
                        {c.codigoInterno} · <span className="font-mono">{c.patente}</span>
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      {c.usoVigente ? (
                        <Chip tono="exito">Desde {formatearFechaHora(c.usoVigente.desdeTs, zonaHoraria)}</Chip>
                      ) : (
                        <Chip tono="neutro">Sin uso</Chip>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {c.mochila ? (
                        <span>
                          <span className="font-mono">{c.mochila.codigo}</span> · {c.mochila.nombre}
                        </span>
                      ) : (
                        <span className="text-tinta-suave">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{c.mochila ? conUnidad(c.mochila.saldoL, 'L') : '—'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {c.mochila?.ultimoControlEn ? (
                        <>
                          {formatearFechaHora(c.mochila.ultimoControlEn, zonaHoraria)} · {conUnidad(c.mochila.ultimoControlL, 'L')}
                        </>
                      ) : (
                        <span className="text-tinta-suave">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
