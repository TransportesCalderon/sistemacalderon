'use client';

import { ArrowRight, Fuel, TriangleAlert } from 'lucide-react';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { cn } from '@/shared/lib/cn';
import { formatearNumero } from '@/shared/lib/numeros';
import type { CierreViajeId } from '@/shared/types/dominio';
import { VERSION_TANQUE_CIERRE } from '../../domain/cierre-tanque.types';
import { useTanqueCierre } from '../../queries/hooks';

const litros = (v: number | null) => (v === null ? '—' : `${formatearNumero(v, 0)} L`);

function Paso({ titulo, valor, detalle, fuerte }: { titulo: string; valor: string; detalle?: string; fuerte?: boolean }) {
  return (
    <div className={cn('min-w-0 flex-1 rounded-lg border border-borde p-3', fuerte && 'border-marca/40 bg-marca/5')}>
      <p className="text-xs text-tinta-suave">{titulo}</p>
      <p className={cn('tabular-nums', fuerte ? 'text-2xl font-semibold text-tinta' : 'text-lg font-semibold text-tinta')}>{valor}</p>
      {detalle && <p className="text-xs text-tinta-suave">{detalle}</p>}
    </div>
  );
}

/**
 * Migración 206 · El tanque del viaje sin hacer cuentas: con cuántos litros salió, cuánto cargó en el viaje
 * y cuánto consumió según el libro. Lo calcula la base (fue.fn_tanque_cierre).
 */
export function TanqueCierre({ cierreId }: { cierreId: CierreViajeId }) {
  const hay = useBaseTiene(VERSION_TANQUE_CIERRE);
  const { data: t } = useTanqueCierre(cierreId, hay);
  if (!hay || !t || !t.disponible) return null;
  const trasvases = (t.entradasL ?? 0) !== 0 || (t.salidasL ?? 0) !== 0;
  return (
    <div className="space-y-2">
      <p className="flex flex-wrap items-center gap-2 text-base text-tinta">
        <Fuel className="size-5 text-marca" />
        {t.salioConL !== null ? (
          <span>
            Salió con <strong className="tabular-nums">{litros(t.salioConL)}</strong>
            {(t.faltanteSalidaL ?? 0) > 0
              ? ` (tanque de ${litros(t.capacidadL)}, le faltaron ${litros(t.faltanteSalidaL)} para llenar)`
              : ` (tanque lleno, ${litros(t.capacidadL)})`}
          </span>
        ) : (
          <span>
            Salió con el tanque lleno
            {(t.faltanteSalidaL ?? 0) > 0 && ` menos ${litros(t.faltanteSalidaL)}`}
          </span>
        )}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <Paso titulo="Salió con" valor={litros(t.salioConL)} detalle={(t.faltanteSalidaL ?? 0) > 0 ? `faltaron ${litros(t.faltanteSalidaL)} para lleno` : 'tanque lleno'} fuerte />
        <ArrowRight className="hidden size-4 shrink-0 self-center text-tinta-suave sm:block" />
        <Paso
          titulo="Cargó en el viaje"
          valor={`+ ${litros(t.cargadoViajeL)}`}
          detalle={trasvases ? `y trasvases: + ${litros(t.entradasL)} / − ${litros(t.salidasL)}` : 'sin contar la carga de llegada'}
        />
        <ArrowRight className="hidden size-4 shrink-0 self-center text-tinta-suave sm:block" />
        <Paso titulo="Consumió (libro)" valor={litros(t.consumoLibroL)} detalle="lo que se cargó para volver a llenar" fuerte />
      </div>
      {t.aviso && (
        <p className="flex items-start gap-1.5 text-sm text-alerta">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {t.aviso}
        </p>
      )}
    </div>
  );
}
