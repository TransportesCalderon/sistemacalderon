import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NAVEGACION } from '@/modules/core/navigation/navigation';
import { parsearLibro } from '@/modules/pizarra/domain/salidas.types';

describe('migración 196 · libro de salidas de la base', () => {
  it('separa las detectadas por GPS de las confirmadas y trae lo que falta', () => {
    const l = parsearLibro({
      base: 'Base Mendoza',
      pendientes: 1,
      salidas: [
        { id: 1, fecha: '2026-11-06', estado: 'detectada', origen: 'gps', tractor: 'SDKZ68', faltan: ['semi'] },
        { id: 2, fecha: '2026-11-06', estado: 'confirmada', origen: 'manual', tractor: 'GCSC96', semi: 'PWTT45', genset: 'GS74', faltan: [] },
      ],
    });
    expect(l.salidas.map((s) => s.estado)).toEqual(['detectada', 'confirmada']);
    expect(l.salidas[0]?.faltan).toEqual(['semi']);
    expect(l.salidas[1]).toMatchObject({ origen: 'manual', genset: 'GS74' });
  });

  it('es una vista de la Pizarra con entrada en el menú Viajes', () => {
    expect(readFileSync('src/app/(app)/pizarra/page.tsx', 'utf8')).toContain("vista === 'salidas'");
    expect(NAVEGACION.find((g) => g.id === 'logistica')?.entradas.some((e) => e.href === '/pizarra?vista=salidas')).toBe(true);
  });
});
