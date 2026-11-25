import { describe, expect, it } from 'vitest';
import { periodoACerrar } from '@/modules/chofer/domain/chofer.types';

describe('fondo fijo: qué período se cierra', () => {
  it('sin movimientos en el período anterior (octubre 2026, liquidado por fuera) se cierra el de hoy', () => {
    expect(periodoACerrar('2026-11-01', null, [{ periodo: '2026-11-01' }])).toBe('2026-11-01');
  });
  it('si el anterior quedó con movimientos sin cerrar, va ese primero', () => {
    expect(periodoACerrar('2026-12-01', null, [{ periodo: '2026-11-01' }])).toBe('2026-11-01');
    expect(periodoACerrar('2026-12-01', '2026-11-01', [{ periodo: '2026-11-01' }])).toBe('2026-12-01');
  });
});
