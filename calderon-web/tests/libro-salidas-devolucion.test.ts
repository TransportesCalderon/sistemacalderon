import { describe, expect, it } from 'vitest';
import { parsearLibro } from '@/modules/pizarra/domain/salidas.types';

describe('migración 205 · devolución del vacío en el libro de salidas', () => {
  it('cada salida trae dónde devuelve el vacío y el libro sugiere los lugares usados', () => {
    const l = parsearLibro({
      lugares_devolucion: ['Depósito SAAM', 'Puerto San Antonio', 3],
      salidas: [
        { id: 1, fecha: '2026-11-06', estado: 'confirmada', origen: 'manual', devolucion_vacio: 'Depósito SAAM' },
        { id: 2, fecha: '2026-11-06', estado: 'confirmada', origen: 'manual' },
      ],
    });
    expect(l.lugaresDevolucion).toEqual(['Depósito SAAM', 'Puerto San Antonio']);
    expect(l.salidas[0]?.devolucionVacio).toBe('Depósito SAAM');
    expect(l.salidas[1]?.devolucionVacio).toBeNull();
  });

  it('una base sin el cambio devuelve lista vacía de lugares', () => {
    expect(parsearLibro({ salidas: [] }).lugaresDevolucion).toEqual([]);
  });
});
