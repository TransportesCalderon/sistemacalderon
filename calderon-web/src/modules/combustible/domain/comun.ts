import { z } from 'zod';

/**
 * Utilidades compartidas del módulo Combustible.
 * Regla del módulo (migración 24): la base calcula y decide. Acá solo se convierten
 * tipos y se valida la forma de los datos de los formularios; las reglas de negocio
 * (fronteras, período cerrado, aprobaciones, tolerancias) las aplica PostgreSQL y su
 * mensaje se muestra tal cual.
 */

/** numeric de PostgREST (number o texto) → number | null. Solo para mostrar. */
export const num = (v: number | string | null | undefined): number | null => (v === null || v === undefined || v === '' ? null : Number(v));
export const num0 = (v: number | string | null | undefined): number => num(v) ?? 0;

/** Guarda de pertenencia a una lista de literales. */
export const esDe =
  <const T extends readonly string[]>(lista: T) =>
  (v: unknown): v is T[number] =>
    typeof v === 'string' && (lista as readonly string[]).includes(v);

/** Campo de texto opcional del formulario → string | null. */
export const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres.`)
    .transform((v) => (v === '' ? null : v));

/** Texto obligatorio. */
export const textoObligatorio = (max: number, mensaje: string) => z.string().trim().min(1, mensaje).max(max, `Máximo ${max} caracteres.`);

/** Número decimal escrito por el usuario (admite coma) → number | null. */
export const decimalTexto = (opcional: boolean, mensaje = 'Número con hasta 2 decimales.') =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(',', '.'))
    .refine((v) => (opcional && v === '') || /^\d{1,9}(\.\d{1,4})?$/.test(v), mensaje)
    .transform((v) => (v === '' ? null : Number(v)));

/** Id elegido en un <select> ('' = ninguno) → number | null. */
export const idOpcional = () =>
  z
    .union([z.string(), z.number(), z.null()])
    .transform((v) => (v === '' || v === null ? null : Number(v)))
    .refine((v) => v === null || (Number.isInteger(v) && v > 0), 'Elegí una opción válida.');

export const idObligatorio = (mensaje: string) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => (v === '' ? NaN : Number(v)))
    .refine((v) => Number.isInteger(v) && v > 0, mensaje);

export const id = () => z.number().int().positive();
export const version = () => z.number().int().positive();
export const instante = (mensaje = 'Indicá la fecha y la hora.') => z.iso.datetime({ offset: true, message: mensaje });

/** Parámetros de lista ⇄ URL. */
export type EntradaUrl = URLSearchParams | Record<string, string | string[] | undefined>;

export function leerParam(e: EntradaUrl, clave: string): string | undefined {
  if (e instanceof URLSearchParams) return e.get(clave) ?? undefined;
  const v = e[clave];
  return Array.isArray(v) ? v[0] : v;
}

export const FECHA_DIA = /^\d{4}-\d{2}-\d{2}$/;

export function paginaDe(e: EntradaUrl): number {
  const p = Number(leerParam(e, 'pagina'));
  return Number.isInteger(p) && p > 1 && p < 10_000 ? p : 1;
}

export function idDe(e: EntradaUrl, clave: string): number | undefined {
  const v = leerParam(e, clave);
  return v && /^[1-9]\d{0,14}$/.test(v) ? Number(v) : undefined;
}

/** Día siguiente ('AAAA-MM-DD'), para filtrar "hasta" inclusive. */
export function diaSiguiente(dia: string): string {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Convierte el segmento [id] de la URL; null si no es un id válido. */
export function idDeRuta<T extends number>(valor: string): T | null {
  return /^[1-9]\d{0,15}$/.test(valor) ? (Number(valor) as T) : null;
}
