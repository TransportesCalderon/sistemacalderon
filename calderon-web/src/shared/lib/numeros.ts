/** Formato de números para la interfaz (es-AR: coma decimal, punto de miles). */
const formatos = new Map<number, Intl.NumberFormat>();

export function formatearNumero(valor: number | null | undefined, decimales = 2): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '—';
  let f = formatos.get(decimales);
  if (!f) {
    f = new Intl.NumberFormat('es-AR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
    formatos.set(decimales, f);
  }
  return f.format(valor);
}

/** "598,00 L", "1.152 km", etc. */
export function conUnidad(valor: number | null | undefined, unidad: string, decimales = 2): string {
  const t = formatearNumero(valor, decimales);
  return t === '—' ? t : `${t} ${unidad}`;
}

/** Con signo explícito: "+0,52", "−3,10". */
export function conSigno(valor: number | null | undefined, decimales = 2): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '—';
  const t = formatearNumero(Math.abs(valor), decimales);
  return valor > 0 ? `+${t}` : valor < 0 ? `−${t}` : t;
}
