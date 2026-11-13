'use client';

import { ShieldCheck } from 'lucide-react';
import { useSesion } from '@/modules/core/session/session-provider';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { useSegundoNivelCierre } from '../../queries/hooks';
import { Chip, Seccion } from '../comun/ui';

/**
 * Migración 200 · Si se descuenta al chofer menos que la diferencia, el cierre lleva dos aprobaciones:
 * la de siempre y la de un gerente habilitado. Muestra en qué paso está (lo calcula la base).
 */
export function SegundoNivel({ cierreId, estado }: { cierreId: number; estado: string }) {
  const { zonaHoraria } = useSesion();
  const { data } = useSegundoNivelCierre(cierreId, estado !== 'anulado');
  if (!data || !data.requiere) return null;
  const l = (v: number) => `${formatearNumero(v, 1)} L`;
  return (
    <Seccion titulo="Aprobación con segundo nivel">
      <p className="text-sm text-tinta">
        La diferencia es de <b>{l(data.diferenciaL)}</b> y se descuentan <b>{l(data.aDescontarL)}</b> al chofer: además de la aprobación de siempre,
        hace falta la de un gerente habilitado.
      </p>
      <ol className="mt-2 space-y-1 text-sm">
        <li className="flex flex-wrap items-center gap-2">
          <ShieldCheck className="size-4 text-tinta-suave" /> 1.ª aprobación:
          {data.primeraPor && data.primeraVigente ? (
            <Chip tono="exito">
              {data.primeraPor} · {formatearFechaHora(data.primeraEn, zonaHoraria)}
            </Chip>
          ) : (
            <Chip tono="neutro">{data.primeraPor ? 'Se cayó: cambió el borrador; hay que volver a aprobar' : 'Pendiente'}</Chip>
          )}
        </li>
        <li className="flex flex-wrap items-center gap-2">
          <ShieldCheck className="size-4 text-tinta-suave" /> 2.ª aprobación (gerente):
          {data.segundaPor ? (
            <Chip tono="exito">
              {data.segundaPor} · {formatearFechaHora(data.segundaEn, zonaHoraria)}
            </Chip>
          ) : (
            <Chip tono={data.primeraVigente ? 'alerta' : 'neutro'}>{data.primeraVigente ? 'Esperando' : 'Después de la primera'}</Chip>
          )}
        </li>
      </ol>
    </Seccion>
  );
}
