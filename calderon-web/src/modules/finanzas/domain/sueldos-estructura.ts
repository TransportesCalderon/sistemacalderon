/**
 * Finanzas › Gastos fijos · Sueldos de la estructura (gerencia, operaciones, telemetría…).
 * Cada sueldo es un gasto fijo «sin documento» y sin proveedor; el área y la persona van en el nombre:
 * «Sueldo · Área · Persona o puesto». Los sueldos de choferes no van acá: salen de RR. HH. › Liquidaciones.
 */
export const PREFIJO_SUELDO = 'Sueldo · ';
/** Código de la cuenta contable de los sueldos de estructura. */
export const CUENTA_SUELDOS = '6.1.01';
export const AREAS_ESTRUCTURA = ['Gerencia', 'Operaciones', 'Telemetría', 'Administración', 'Finanzas', 'Facturación', 'RR. HH.', 'Taller', 'TI'] as const;

export const esSueldo = (nombre: string): boolean => nombre.startsWith(PREFIJO_SUELDO);

const limpio = (s: string): string => s.replace(/·/g, '-').replace(/\s+/g, ' ').trim();

export function nombreSueldo(area: string, persona: string): string {
  return `${PREFIJO_SUELDO}${limpio(area)} · ${limpio(persona)}`;
}

/** «Sueldo · Operaciones · Juan Pérez» → área y persona. Si no tiene área, queda en «Sin área». */
export function partesSueldo(nombre: string): { area: string; persona: string } {
  const resto = esSueldo(nombre) ? nombre.slice(PREFIJO_SUELDO.length) : nombre;
  const i = resto.indexOf(' · ');
  return i < 0 ? { area: 'Sin área', persona: resto.trim() } : { area: resto.slice(0, i).trim(), persona: resto.slice(i + 3).trim() };
}

export interface GrupoSueldos<T> {
  area: string;
  sueldos: T[];
  /** Suma del mes en pesos chilenos de los activos. */
  totalClp: number;
}

/** Agrupa los sueldos por área (orden alfabético) y suma lo que cuesta cada una por mes. */
export function agruparSueldos<T extends { nombre: string; activo: boolean; montoClp: number | null }>(fijos: T[]): GrupoSueldos<T>[] {
  const grupos = new Map<string, GrupoSueldos<T>>();
  for (const f of fijos) {
    if (!esSueldo(f.nombre)) continue;
    const { area } = partesSueldo(f.nombre);
    const g = grupos.get(area) ?? { area, sueldos: [], totalClp: 0 };
    g.sueldos.push(f);
    if (f.activo) g.totalClp += f.montoClp ?? 0;
    grupos.set(area, g);
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, sueldos: [...g.sueldos].sort((a, b) => partesSueldo(a.nombre).persona.localeCompare(partesSueldo(b.nombre).persona, 'es')) }))
    .sort((a, b) => a.area.localeCompare(b.area, 'es'));
}
