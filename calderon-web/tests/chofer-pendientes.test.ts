import { describe, expect, it } from 'vitest';
import { parsearPendientesChofer } from '@/modules/flota/domain/chofer.types';

describe('Migración 265 · lo que un chofer tiene abierto', () => {
  it('lee lo que devuelve la base', () => {
    expect(parsearPendientesChofer({ hay: true, texto: 'sigue asignado a AB123CD (titular)', asignaciones: 'AB123CD (titular)' })).toEqual({
      hay: true,
      texto: 'sigue asignado a AB123CD (titular)',
      // Antes de la 363 la base no dice qué frena la baja
      frenaBaja: null,
      textoBaja: null,
      cierres: null,
    });
  });

  it('sin pendientes no hay texto', () => {
    expect(parsearPendientesChofer({ hay: false, texto: null })).toEqual({ hay: false, texto: null, frenaBaja: null, textoBaja: null, cierres: null });
  });

  it('una respuesta rara no avisa nada', () => {
    const nada = { hay: false, texto: null, frenaBaja: null, textoBaja: null, cierres: null };
    expect(parsearPendientesChofer(null)).toEqual(nada);
    expect(parsearPendientesChofer({ hay: 'true', texto: '' })).toEqual(nada);
  });
});
