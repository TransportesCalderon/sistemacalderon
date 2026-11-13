'use client';

import type { ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { formatearNumero } from '@/shared/lib/numeros';
import type { CierreViajeId } from '@/shared/types/dominio';
import { repartoFaltante } from '../../domain/cierre-tanque.types';
import { useTanqueCierre } from '../../queries/hooks';
import { DiferenciaL } from '../comun/ui';

/** Enteros sin decimales; si tiene decimales, dos (así cargó − debería da justo la diferencia). */
const litros = (v: number | null) => (v === null ? '—' : `${formatearNumero(v, Number.isInteger(Math.round(v * 100) / 100) ? 0 : 2)} L`);

function Paso({ titulo, children, fuerte }: { titulo: string; children: ReactNode; fuerte?: boolean }) {
  return (
    <div className={cn('min-w-0 flex-1 rounded-lg border border-borde p-3', fuerte && 'border-marca/40 bg-marca/5')}>
      <p className="text-xs text-tinta-suave">{titulo}</p>
      <p className="text-xl font-semibold text-tinta tabular-nums">{children}</p>
    </div>
  );
}

/**
 * Migración 206/208 · Salió con, cargó en el viaje, consumió (plataforma), debería haber cargado, cargó al llegar
 * y la diferencia (cargó − debería).
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
  const { data: t } = useTanqueCierre(cierreId, true);
  if (!t || !t.disponible) return null;
  const salio = t.salioConL !== null ? litros(t.salioConL) : (t.faltanteSalidaL ?? 0) > 0 ? `Lleno − ${litros(t.faltanteSalidaL)}` : 'Lleno';
  const repartoSalida = repartoFaltante(t.faltanteSalidaL, t.faltanteSalidaMochilaL);
  const repartoLlegada = repartoFaltante(t.faltanteLlegadaL, t.faltanteLlegadaMochilaL);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Paso titulo="Salió con">{salio}</Paso>
        <Paso titulo="Cargó en el viaje">{litros(t.cargadoViajeL)}</Paso>
        <Paso titulo="Consumió (plataforma)" fuerte>
          {litros(consumoL)}
        </Paso>
        <Paso titulo="Debería haber cargado">{litros(t.deberiaCargarL)}</Paso>
        <Paso titulo="Cargó al llegar">{litros(t.cargaLlegadaL)}</Paso>
        <Paso titulo="Diferencia">
          <DiferenciaL litros={diferenciaL} toleranciaL={toleranciaL} />
        </Paso>
      </div>
      {(repartoSalida || repartoLlegada) && (
        <p className="text-xs text-tinta-suave">
          {repartoSalida && <>Faltó llenar al salir ({litros(t.faltanteSalidaL)}): {repartoSalida}. </>}
          {repartoLlegada && <>Faltó llenar al llegar ({litros(t.faltanteLlegadaL)}): {repartoLlegada}.</>}
        </p>
      )}
      {t.aviso && (
        <p className="flex items-start gap-1.5 text-sm text-alerta">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {t.aviso}
        </p>
      )}
    </div>
  );
}
