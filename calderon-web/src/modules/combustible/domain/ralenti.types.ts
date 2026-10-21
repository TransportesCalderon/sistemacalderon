/** Ralentí del mes por chofer (migración 50). Lo calcula la base; acá solo se muestra. */
export interface RalentiChofer {
  choferId: number | null;
  chofer: string | null;
  ralentiL: number;
  ralentiH: number | null;
  dias: number;
  diasSinLitros: number;
  camiones: string | null;
  permitidoL: number;
  excesoL: number;
  precioPromedio: number | null;
  precioPropuesto: number | null;
  moneda: string;
  importe: number | null;
  cierre: { id: number; numero: string; justificadoL: number; excesoL: number; precio: number | null; importe: number | null } | null;
}

/** Primer día del mes anterior al de hoy ('AAAA-MM-01'). */
export function mesAnterior(hoy: string): string {
  const [a, m] = hoy.split('-').map(Number) as [number, number];
  const fecha = new Date(Date.UTC(a, m - 2, 1));
  return fecha.toISOString().slice(0, 7) + '-01';
}
