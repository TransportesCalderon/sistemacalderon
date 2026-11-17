import { describe, expect, it } from 'vitest';
import { agruparSueldos, esSueldo, nombreSueldo, partesSueldo } from '@/modules/finanzas/domain/sueldos-estructura';

const f = (nombre: string, montoClp: number | null, activo = true) => ({ nombre, montoClp, activo });

describe('Finanzas › Gastos fijos: sueldos de la estructura', () => {
  it('arma y lee el nombre con área y persona', () => {
    const n = nombreSueldo('Operaciones', '  ZZ   Persona Uno ');
    expect(n).toBe('Sueldo · Operaciones · ZZ Persona Uno');
    expect(esSueldo(n)).toBe(true);
    expect(partesSueldo(n)).toEqual({ area: 'Operaciones', persona: 'ZZ Persona Uno' });
    expect(esSueldo('Leasing ZZ')).toBe(false);
    expect(partesSueldo('Sueldo · ZZ Suelto')).toEqual({ area: 'Sin área', persona: 'ZZ Suelto' });
  });
  it('un punto medio escrito por la persona no rompe el nombre', () => {
    expect(partesSueldo(nombreSueldo('Gerencia', 'ZZ · Gerente'))).toEqual({ area: 'Gerencia', persona: 'ZZ - Gerente' });
  });
  it('agrupa por área y suma solo los activos', () => {
    const g = agruparSueldos([
      f('Sueldo · Operaciones · ZZ B', 900_000),
      f('Sueldo · Gerencia · ZZ G', 2_000_000),
      f('Leasing ZZ', 3_000_000),
      f('Sueldo · Operaciones · ZZ A', 800_000),
      f('Sueldo · Operaciones · ZZ C', 700_000, false),
    ]);
    expect(g.map((x) => x.area)).toEqual(['Gerencia', 'Operaciones']);
    expect(g[1]!.sueldos.map((s) => partesSueldo(s.nombre).persona)).toEqual(['ZZ A', 'ZZ B', 'ZZ C']);
    expect(g[1]!.totalClp).toBe(1_700_000);
  });
});
