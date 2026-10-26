'use client';

import Link from 'next/link';
import { ArrowRight, Landmark } from 'lucide-react';
import { Chip } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import { dinero, ETIQUETA_ORIGEN } from '../domain/finanzas.types';
import { useTraza } from '../queries/hooks';
import { fecha } from './comun';

/**
 * Contabilidad de un documento (migración 74): sus asientos, los documentos relacionados
 * (la factura del proveedor de una carga, las operaciones de una factura…), los pagos o
 * cobros y si están conciliados con el banco. Solo lo ven quienes ven Finanzas.
 */
export function TrazaContable({ origen, id }: { origen: string; id: number }) {
  const puede = useCan('finanzas.resumen:ver');
  const { data, isLoading, isError } = useTraza(origen, puede ? id : null);
  if (!puede) return null;
  return (
    <details className="rounded-lg border border-borde bg-panel p-3 text-sm">
      <summary className="flex cursor-pointer items-center gap-2 font-medium text-tinta">
        <Landmark className="size-4 text-marca" /> Contabilidad y dinero de este documento
      </summary>
      {isLoading ? (
        <p className="mt-2 text-tinta-suave">Buscando…</p>
      ) : isError || !data ? (
        <p className="mt-2 text-error">No se pudo leer la contabilidad.</p>
      ) : (
        <div className="mt-3 space-y-4">
          {data.pendiente && (
            <p className="rounded-md bg-alerta-suave p-2 text-alerta">
              Sin contabilizar: {data.pendiente}
            </p>
          )}
          {data.relacionados.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-tinta-suave uppercase">Relacionado</p>
              <ul className="space-y-1">
                {data.relacionados.map((r) => (
                  <li key={`${r.clase}-${r.id}`}>
                    {r.ruta ? (
                      <Link href={r.ruta} className="inline-flex items-center gap-1 text-marca hover:underline">
                        <ArrowRight className="size-3.5" /> {r.texto}
                      </Link>
                    ) : (
                      r.texto
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data.movimientos.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-tinta-suave uppercase">Pagos y cobros</p>
              <ul className="divide-y divide-borde">
                {data.movimientos.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
                    <span className="tabular-nums">{fecha(m.fecha)}</span>
                    <span>{m.cuenta}</span>
                    <span className="font-medium tabular-nums">{dinero(m.monto, m.moneda)}</span>
                    <span className="text-xs text-tinta-suave">{m.numero}</span>
                    {m.estado === 'anulado' ? (
                      <Chip tono="neutro">Anulado</Chip>
                    ) : m.cartola ? (
                      <Chip tono="exito" title={m.cartola.descripcion}>
                        En el banco el {fecha(m.cartola.fecha)}
                      </Chip>
                    ) : (
                      <Chip tono="alerta">Sin conciliar con el banco</Chip>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data.asientos.length === 0 && !data.pendiente ? (
            <p className="text-tinta-suave">Este documento no mueve la contabilidad.</p>
          ) : (
            data.asientos.map((a) => (
              <div key={a.id}>
                <p className="text-xs text-tinta-suave">
                  {ETIQUETA_ORIGEN[a.origen] ?? a.origen} · asiento {a.id} · {fecha(a.fecha)} · {a.glosa}
                </p>
                <table className="mt-1 w-full tabular-nums">
                  <tbody className="divide-y divide-borde">
                    {a.lineas.map((l, i) => (
                      <tr key={i}>
                        <td className={l.haber > 0 ? 'py-1 pl-6' : 'py-1'}>
                          {l.codigo} · {l.cuenta}
                          {l.detalle && <span className="block text-xs text-tinta-suave">{l.detalle}</span>}
                        </td>
                        <td className="w-32 py-1 text-right">{l.debe ? dinero(l.debe) : ''}</td>
                        <td className="w-32 py-1 text-right">{l.haber ? dinero(l.haber) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </div>
      )}
    </details>
  );
}
