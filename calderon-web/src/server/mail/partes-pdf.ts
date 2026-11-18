import type { MessageStructureObject } from 'imapflow';

/** Migración 277 · Las partes de un mail que son PDF (por tipo o por el nombre del archivo), para bajar solo esas. */
export function partesPdf(nodo: MessageStructureObject | undefined, raiz = true): { parte: string; nombre: string }[] {
  if (!nodo) return [];
  const hijos = (nodo.childNodes ?? []).flatMap((h) => partesPdf(h, false));
  // Un mail que es solo el PDF (sin partes) se baja como parte «1»
  const parte = nodo.part ?? (raiz && !nodo.childNodes ? '1' : undefined);
  const nombre = String(nodo.dispositionParameters?.filename ?? nodo.parameters?.name ?? '');
  const esPdf = nodo.type?.toLowerCase() === 'application/pdf' || /\.pdf$/i.test(nombre);
  return esPdf && parte ? [{ parte, nombre: nombre || 'remito.pdf' }, ...hijos] : hijos;
}

