import { z } from 'zod';

/**
 * Migración 121 · Tipos de carga (mercadería): A GRANEL, BOLSONES, PALLET, CONTENEDOR 40 RF…
 * La lista vive en la base (ref.tipo_carga) y la editan Gerencia o TI; la base decide quién
 * puede y valida todo. El nombre es lo que se guarda en la operación, la tarifa y la cotización.
 */
export const VERSION_TIPOS_CARGA = 121;

export interface TipoCarga {
  id: number;
  nombre: string;
  requiereFrio: boolean;
  esContenedor: boolean;
  activo: boolean;
  orden: number;
  usos: number;
}

export interface TiposCarga {
  puedeEditar: boolean;
  tipos: TipoCarga[];
}

type Obj = Record<string, unknown>;

export function parsearTiposCarga(raw: unknown): TiposCarga {
  const j = (raw ?? {}) as Obj;
  const tipos = Array.isArray(j.tipos) ? (j.tipos as Obj[]) : [];
  return {
    puedeEditar: j.puede_editar === true,
    tipos: tipos.map((t) => ({
      id: Number(t.id),
      nombre: String(t.nombre ?? ''),
      requiereFrio: t.requiere_frio === true,
      esContenedor: t.es_contenedor === true,
      activo: t.activo !== false,
      orden: Number(t.orden ?? 100),
      usos: Number(t.usos ?? 0),
    })),
  };
}

/** Las opciones de un formulario: los activos y, si el registro tenía uno viejo, ese también. */
export function opcionesTipoCarga(tipos: TipoCarga[] | undefined, actual: string): { valor: string; etiqueta: string }[] {
  const activos = (tipos ?? []).filter((t) => t.activo).map((t) => ({ valor: t.nombre, etiqueta: t.nombre }));
  const v = actual.trim();
  if (v && !activos.some((o) => o.valor === v)) activos.push({ valor: v, etiqueta: `${v} (anterior)` });
  return activos;
}

export const tipoCargaSchema = z.object({
  id: z.number().int().positive().nullable(),
  nombre: z.string().trim().min(1, 'Escribí el nombre').max(30, 'Hasta 30 letras'),
  requiereFrio: z.boolean(),
  esContenedor: z.boolean(),
  activo: z.boolean(),
  orden: z.number().int().min(0).max(999),
});
export type TipoCargaDatos = z.infer<typeof tipoCargaSchema>;
