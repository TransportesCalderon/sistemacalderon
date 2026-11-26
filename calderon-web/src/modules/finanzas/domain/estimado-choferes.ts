/**
 * Migración 366 · Lo que se les debe a los choferes en el mes (bono por tramo y adicional por km) mientras la
 * liquidación no está aprobada. Lo calcula la base igual que el paso 1 de la liquidación; es solo para mostrar.
 */
export interface EstimadoChoferes {
  /** AAAA-MM-DD (primer día del mes) */
  periodo: string;
  desde: string;
  hasta: string;
  moneda: string;
  bono: number;
  adicionalKm: number;
  km: number;
  total: number;
  choferes: number;
  calculadoEn: string | null;
}

type Obj = Record<string, unknown>;

export function parsearEstimadoChoferes(raw: unknown): EstimadoChoferes {
  const x = (raw ?? {}) as Obj;
  const n = (v: unknown) => (v === null || v === undefined || v === '' ? 0 : Number(v));
  return {
    periodo: String(x.periodo ?? ''),
    desde: String(x.desde ?? ''),
    hasta: String(x.hasta ?? ''),
    moneda: String(x.moneda ?? 'CLP'),
    bono: n(x.bono),
    adicionalKm: n(x.adicional_km),
    km: n(x.km),
    total: n(x.total),
    choferes: n(x.choferes),
    calculadoEn: x.calculado_en ? String(x.calculado_en) : null,
  };
}

/** Agrega el estimado a «En qué se fue la plata este mes», ordenado de mayor a menor. */
export function principalesConEstimado(
  items: { nombre: string; valor: number }[],
  e: EstimadoChoferes | null | undefined,
): { nombre: string; valor: number; estimado?: boolean }[] {
  if (!e || e.total <= 0) return items;
  return [...items, { nombre: 'Choferes: bono por tramo y km (estimado, sin liquidar)', valor: e.total, estimado: true }].sort((a, b) => b.valor - a.valor);
}
