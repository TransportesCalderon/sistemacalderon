import { describe, expect, it } from 'vitest';
import { parsearPendientesChofer } from '@/modules/flota/domain/chofer.types';

describe('Migración 265 · lo que un chofer tiene abierto', () => {
  it('lee lo que devuelve la base', () => {
    expect(parsearPendientesChofer({ hay: true, texto: 'sigue asignado a AB123CD (titular)', asignaciones: 'AB123CD (titular)' })).toEqual({
      hay: true,
      texto: 'sigue asignado a AB123CD (titular)',
    });
  });

  it('sin pendientes no hay texto', () => {
    expect(parsearPendientesChofer({ hay: false, texto: null })).toEqual({ hay: false, texto: null });
  });

  it('una respuesta rara no avisa nada', () => {
    expect(parsearPendientesChofer(null)).toEqual({ hay: false, texto: null });
    expect(parsearPendientesChofer({ hay: 'true', texto: '' })).toEqual({ hay: false, texto: null });
  });
});
