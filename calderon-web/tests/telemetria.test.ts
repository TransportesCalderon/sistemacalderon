import { describe, expect, it } from 'vitest';
import { haceTexto, minutosDesde, senalDe } from '@/modules/telemetria/domain/flota.types';

describe('telemetría: señal de cada camión', () => {
  const ahora = Date.parse('2026-10-16T21:00:00Z');
  it('minutos desde la última lectura', () => {
    expect(minutosDesde('2026-10-16T20:48:00Z', ahora)).toBe(12);
    expect(minutosDesde(null, ahora)).toBeNull();
    expect(minutosDesde('2026-10-16T21:05:00Z', ahora)).toBe(0);
  });
  it('en línea hasta 30 min, demorada hasta 24 h, después sin señal', () => {
    expect(senalDe(30)).toBe('vivo');
    expect(senalDe(31)).toBe('demorada');
    expect(senalDe(24 * 60)).toBe('demorada');
    expect(senalDe(24 * 60 + 1)).toBe('sin_senal');
    expect(senalDe(null)).toBe('sin_senal');
  });
  it('texto relativo', () => {
    expect(haceTexto(0)).toBe('recién');
    expect(haceTexto(12)).toBe('hace 12 min');
    expect(haceTexto(150)).toBe('hace 2 h');
    expect(haceTexto(3 * 24 * 60)).toBe('hace 3 días');
    expect(haceTexto(null)).toBe('sin datos');
  });
});
