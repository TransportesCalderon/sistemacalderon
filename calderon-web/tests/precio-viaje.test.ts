import { describe, expect, it } from 'vitest';
import { numeroAPunto } from '@/modules/logistica/repositories/operaciones.repository';

describe('precio del viaje (migración 166)', () => {
  it('pasa el número a punto decimal para la base (solo formato)', () => {
    expect(numeroAPunto('1.850,50')).toBe('1850.50');
    expect(numeroAPunto('1850.5')).toBe('1850.5');
    expect(numeroAPunto('1.850')).toBe('1850');
    expect(numeroAPunto('12.500.000')).toBe('12500000');
    expect(numeroAPunto(' 2 000 ')).toBe('2000');
    expect(numeroAPunto('')).toBe('');
  });
});
