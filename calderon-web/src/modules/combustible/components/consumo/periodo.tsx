'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useSesion } from '@/modules/core/session/session-provider';
import { hoyEnZona } from '@/shared/lib/fechas';
import { CONTROL_FILTRO } from '@/shared/ui/clases';
import { parsearPeriodo, serializarPeriodo, type PeriodoParams } from '../../domain/consumo.types';
import { useCamionesCombustible } from '../../queries/hooks';

/** Período (y camión) desde la URL; por defecto el mes en curso. */
export function usePeriodo(ruta: string): [PeriodoParams, (p: PeriodoParams) => void] {
  const { zonaHoraria } = useSesion();
  const sp = useSearchParams();
  const router = useRouter();
  const p = parsearPeriodo(sp, hoyEnZona(zonaHoraria));
  return [p, (n) => router.replace(`${ruta}?${serializarPeriodo(n)}`, { scroll: false })];
}

export function FiltroPeriodo({
  p,
  onCambiar,
  conCamion,
}: {
  p: PeriodoParams;
  onCambiar: (p: PeriodoParams) => void;
  conCamion?: boolean;
}) {
  const { data: camiones } = useCamionesCombustible();
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="space-y-1 text-sm">
        <span className="block text-xs text-tinta-suave">Desde</span>
        <input
          type="date"
          className={CONTROL_FILTRO}
          value={p.desde}
          onChange={(e) => e.target.value && onCambiar({ ...p, desde: e.target.value })}
        />
      </label>
      <label className="space-y-1 text-sm">
        <span className="block text-xs text-tinta-suave">Hasta</span>
        <input
          type="date"
          className={CONTROL_FILTRO}
          value={p.hasta}
          onChange={(e) => e.target.value && onCambiar({ ...p, hasta: e.target.value })}
        />
      </label>
      {conCamion && (
        <label className="space-y-1 text-sm">
          <span className="block text-xs text-tinta-suave">Camión</span>
          <select
            className={CONTROL_FILTRO}
            value={p.camionId ?? ''}
            onChange={(e) => {
              const base = { desde: p.desde, hasta: p.hasta };
              onCambiar(e.target.value ? { ...base, camionId: Number(e.target.value) } : base);
            }}
          >
            <option value="">Todos</option>
            {camiones?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.patente}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

/** Tarjeta de resumen. */
export function Cifra({ etiqueta, valor, detalle, alerta }: { etiqueta: string; valor: string; detalle?: string; alerta?: boolean }) {
  return (
    <div className="rounded-xl border border-borde bg-panel p-4">
      <p className="text-xs text-tinta-suave">{etiqueta}</p>
      <p className={alerta ? 'text-xl font-semibold text-alerta tabular-nums' : 'text-xl font-semibold text-tinta tabular-nums'}>{valor}</p>
      {detalle && <p className="text-xs text-tinta-suave">{detalle}</p>}
    </div>
  );
}
