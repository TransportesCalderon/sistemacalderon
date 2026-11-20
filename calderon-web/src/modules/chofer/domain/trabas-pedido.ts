/** Migración 285 · Qué le falta al chofer para poder pedir dinero: gastos sin subir y tareas pendientes. */
export interface TrabaPedido {
  tipo: 'gastos' | 'ticket' | 'tablero' | 'cierre' | 'otro';
  texto: string;
}

const TIPOS = ['gastos', 'ticket', 'tablero', 'cierre'] as const;

export function parsearTrabas(v: unknown): TrabaPedido[] {
  if (!Array.isArray(v)) return [];
  const r: TrabaPedido[] = [];
  for (const x of v) {
    if (typeof x !== 'object' || x === null) continue;
    const o = x as Record<string, unknown>;
    if (typeof o.texto !== 'string' || o.texto.trim() === '') continue;
    const tipo = TIPOS.find((t) => t === o.tipo) ?? 'otro';
    r.push({ tipo, texto: o.texto });
  }
  return r;
}

/** Las trabas de los pedidos sin pagar, por id de pedido. */
export function parsearTrabasDePedidos(v: unknown): Record<number, TrabaPedido[]> {
  const r: Record<number, TrabaPedido[]> = {};
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return r;
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    const t = parsearTrabas(x);
    if (t.length > 0) r[Number(k)] = t;
  }
  return r;
}
