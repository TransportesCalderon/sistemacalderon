/**
 * Las cuotas de un mismo gasto fijo (un leasing, por ejemplo) van juntas en un renglón que se despliega (pedido del 17/11/2026).
 * Se juntan los gastos fijos del mismo proveedor cuyo detalle es igual salvo el mes y la cuota; si hay uno solo, va suelto.
 */
export function agrupar<T extends { id: number; fijo: boolean; proveedor: string | null; descripcion: string }>(
  gastos: readonly T[],
): (T | { clave: string; nombre: string; gastos: T[] })[] {
  const nombreDe = (g: T) => g.descripcion.replace(/ · \d{2}\/\d{4}.*$/, '');
  const grupos = new Map<string, T[]>();
  for (const g of gastos) {
    if (!g.fijo) continue;
    const k = `${g.proveedor ?? ''}|${nombreDe(g)}`;
    grupos.set(k, [...(grupos.get(k) ?? []), g]);
  }
  const vistos = new Set<string>();
  const r: (T | { clave: string; nombre: string; gastos: T[] })[] = [];
  for (const g of gastos) {
    const k = `${g.proveedor ?? ''}|${nombreDe(g)}`;
    const grupo = g.fijo ? grupos.get(k) : undefined;
    if (!grupo || grupo.length < 2) r.push(g);
    else if (!vistos.has(k)) {
      vistos.add(k);
      r.push({ clave: k, nombre: nombreDe(g), gastos: grupo });
    }
  }
  return r;
}
