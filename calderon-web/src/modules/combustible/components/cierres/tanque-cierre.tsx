'use client';

import type { ReactNode } from 'react';
import { ArrowRight, TriangleAlert } from 'lucide-react';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { cn } from '@/shared/lib/cn';
import { formatearNumero } from '@/shared/lib/numeros';
import type { CierreViajeId } from '@/shared/types/dominio';
import { VERSION_TANQUE_CIERRE } from '../../domain/cierre-tanque.types';
import { useTanqueCierre } from '../../queries/hooks';
import { DiferenciaL } from '../comun/ui';

const litros = (v: number | null) => (v === null ? '—' : `${formatearNumero(v, 0)} L`);

function Paso({ titulo, children, fuerte }: { titulo: string; children: ReactNode; fuerte?: boolean }) {
  return (
    <div className={cn('min-w-0 flex-1 rounded-lg border border-borde p-3', fuerte && 'border-marca/40 bg-marca/5')}>
      <p className="text-xs text-tinta-suave">{titulo}</p>
      <p className="text-xl font-semibold text-tinta tabular-nums">{children}</p>
    </div>
  );
}

/**
 * Migración 206 · Salió con, cargó en el viaje, cargó al llegar, consumió (plataforma) y la diferencia.
 * Los litros del tanque los calcula la base (fue.fn_tanque_cierre); consumo y diferencia vienen del cierre.
 */
export function TanqueCierre({
  cierreId,
  consumoL,
  diferenciaL,
  toleranciaL,
}: {
  cierreId: CierreViajeId;
  consumoL: number | null;
  diferenciaL: number | null;
  toleranciaL: number | null;
}) {
  const hay = useBaseTiene(VERSION_TANQUE_CIERRE);
  const { data: t } = useTanqueCierre(cierreId, hay);
  if (!hay || !t || !t.disponible) return null;
  const salio = t.salioConL !== null ? litros(t.salioConL) : (t.faltanteSalidaL ?? 0) > 0 ? `Lleno − ${litros(t.faltanteSalidaL)}` : 'Lleno';
  const flecha = <ArrowRight className="hidden size-4 shrink-0 self-center text-tinta-suave lg:block" />;
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-3 lg:flex lg:items-stretch">
        <Paso titulo="Salió con">{salio}</Paso>
        {flecha}
        <Paso titulo="Cargó en el viaje">{litros(t.cargadoViajeL)}</Paso>
        {flecha}
        <Paso titulo="Cargó al llegar">{litros(t.cargaLlegadaL)}</Paso>
        <Paso titulo="Consumió (plataforma)" fuerte>
          {litros(consumoL)}
        </Paso>
        <Paso titulo="Diferencia">
          <DiferenciaL litros={diferenciaL} toleranciaL={toleranciaL} />
        </Paso>
      </div>
      {t.aviso && (
        <p className="flex items-start gap-1.5 text-sm text-alerta">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {t.aviso}
        </p>
      )}
    </div>
  );
}
