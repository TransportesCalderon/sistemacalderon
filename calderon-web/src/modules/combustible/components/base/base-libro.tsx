'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BookOpen, Check, X } from 'lucide-react';
import { TD, TH } from '@/modules/catalogos/components/comun';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import type { ErrorAccion } from '@/server/actions/result';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { conSigno } from '@/shared/lib/numeros';
import { ETIQUETA_CATEGORIA_BASE, ETIQUETA_TIPO_MOVIMIENTO_BASE, TAMANO_PAGINA_LIBRO, type MovimientoBase } from '../../domain/base.types';
import { useLibroBase, useResolverMovimientoBase } from '../../queries/hooks';
import { AccionConMotivo, Cargando, Chip, ErrorBase, ErrorLectura, Paginador, Seccion, Vacio } from '../comun/ui';

const ESTADO: Record<'pendiente' | 'aprobado' | 'rechazado', { texto: string; tono: 'alerta' | 'exito' | 'neutro' }> = {
  pendiente: { texto: 'Pendiente de aprobación', tono: 'alerta' },
  aprobado: { texto: 'Aprobado', tono: 'exito' },
  rechazado: { texto: 'Rechazado', tono: 'neutro' },
};

/** Libro del tanque: todo lo que entró y salió, más los ajustes que dejan el libro igual a cada control. */
export function LibroBase({ depositoId }: { depositoId: number }) {
  const { zonaHoraria } = useSesion();
  const [pagina, setPagina] = useState(1);
  const { data, isPending, isError, isFetching, refetch } = useLibroBase(depositoId, pagina);

  return (
    <Seccion titulo="Libro del tanque">
      {isPending ? (
        <Cargando texto="Cargando el libro…" />
      ) : isError ? (
        <ErrorLectura texto="No se pudo cargar el libro." onReintentar={() => refetch()} />
      ) : data.filas.length === 0 ? (
        <Vacio
          icono={<BookOpen className="size-6" />}
          texto="Todavía no hay movimientos. Las cargas en el surtidor propio y las descargas de camiones aparecen acá solas."
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-y border-borde bg-fondo">
                <tr>
                  <th className={TH}>Fecha y hora</th>
                  <th className={TH}>Tipo</th>
                  <th className={cn(TH, 'text-right')}>Litros</th>
                  <th className={TH}>Camión o detalle</th>
                  <th className={TH}>Estado</th>
                </tr>
              </thead>
              <tbody className={cn('divide-y divide-borde', isFetching && 'opacity-70')}>
                {data.filas.map((m) => (
                  <tr key={m.id} className={cn(m.tipo === 'ajuste' && 'text-tinta-suave')}>
                    <td className={cn(TD, 'whitespace-nowrap tabular-nums')}>{formatearFechaHora(m.fechaHora, zonaHoraria)}</td>
                    <td className={TD}>
                      {ETIQUETA_TIPO_MOVIMIENTO_BASE[m.tipo]}
                      {m.categoria && <span className="block text-xs text-tinta-suave">{ETIQUETA_CATEGORIA_BASE[m.categoria]}</span>}
                    </td>
                    <td className={cn(TD, 'text-right font-medium tabular-nums', m.tipo !== 'ajuste' && m.litros > 0 && 'text-exito')}>
                      {conSigno(m.litros)} L
                    </td>
                    <td className={cn(TD, 'max-w-72')}>
                      {m.camionPatente && <span className="font-mono">{m.camionPatente}</span>}
                      {m.cargaId && (
                        <Link href={`/combustible/cargas/${m.cargaId}`} className="ml-2 text-xs text-marca hover:underline">
                          Carga #{m.cargaId}
                        </Link>
                      )}
                      {m.motivo && <span className="block">{m.motivo}</span>}
                      {m.evidencia && <span className="block text-xs text-tinta-suave">Evidencia: {m.evidencia}</span>}
                      {m.motivoResolucion && <span className="block text-xs text-tinta-suave">Resolución: {m.motivoResolucion}</span>}
                      {!m.camionPatente && !m.motivo && <span className="text-tinta-suave">—</span>}
                    </td>
                    <td className={TD}>
                      <Estado m={m} onRecargar={() => refetch()} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Paginador pagina={pagina} total={data.total ?? 0} tamano={TAMANO_PAGINA_LIBRO} onCambiar={setPagina} />
        </>
      )}
    </Seccion>
  );
}

function Estado({ m, onRecargar }: { m: MovimientoBase; onRecargar: () => void }) {
  const { usuarioId } = useSesion();
  const puedeAprobar = useCan('combustible.depositos:transicionar');
  const resolver = useResolverMovimientoBase();
  const [error, setError] = useState<ErrorAccion | null>(null);
  const ejecutar = async (aprobar: boolean, motivo: string) => {
    setError(null);
    const r = await resolver.mutateAsync({ movimientoId: m.id, aprobar, motivo });
    if (!r.ok) setError(r.error);
    return r.ok;
  };

  return (
    <div className="flex min-w-48 flex-col items-start gap-2">
      <div className="flex flex-wrap gap-1">
        {m.estadoAprobacion && <Chip tono={ESTADO[m.estadoAprobacion].tono}>{ESTADO[m.estadoAprobacion].texto}</Chip>}
        {m.anulaId && <Chip tono="neutro">Reverso del #{m.anulaId}</Chip>}
      </div>
      <ErrorBase error={error} onRecargar={onRecargar} />
      {m.estadoAprobacion === 'pendiente' && puedeAprobar && m.creadoPor !== usuarioId && (
        <div className="flex flex-wrap gap-2">
          <AccionConMotivo
            etiqueta="Aprobar"
            icono={<Check className="size-4" />}
            primario
            titulo="Aprobar el movimiento"
            pideMotivo={false}
            ocupado={resolver.isPending}
            error={null}
            onConfirmar={() => ejecutar(true, '')}
          />
          <AccionConMotivo
            etiqueta="Rechazar"
            icono={<X className="size-4" />}
            titulo="Rechazar el movimiento"
            explicacion="Se revierte: los litros vuelven a la diferencia del segmento."
            ocupado={resolver.isPending}
            error={null}
            onConfirmar={(motivo) => ejecutar(false, motivo)}
          />
        </div>
      )}
    </div>
  );
}
