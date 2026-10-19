import { describe, expect, it } from 'vitest';
import { enlaceAlta, haceTexto, minutosDesde, paisDePatente, patenteDeNombre, senalDe } from '@/modules/telemetria/domain/flota.types';

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


describe('telemetría: alta de camión desde la API', () => {
  it('patente al principio del nombre (Renault y Volvo)', () => {
    expect(patenteDeNombre('SRYR 55 // MARCELO RETA')).toBe('SRYR55');
    expect(patenteDeNombre('SHXB49 | MATIAS MARTINEZ')).toBe('SHXB49');
    expect(patenteDeNombre('RLWB45 // MARCO GOMEZ')).toBe('RLWB45');
    expect(patenteDeNombre('CAMION SIN PATENTE CLARA')).toBeNull();
    expect(patenteDeNombre(null)).toBeNull();
  });
  it('país probable', () => {
    expect(paisDePatente('SRYR55')).toBe('CL');
    expect(paisDePatente('AB123CD')).toBe('AR');
    expect(paisDePatente('XYZ')).toBeNull();
  });
  it('enlace al alta con los datos de la API', () => {
    const u = enlaceAlta({ marca: 'volvo', vin: '9BVRG40C5PE923007', nombre: 'SHXB49 | M', modelo: 'FH', camionId: null, patente: null });
    expect(u).toBe('/flota/camiones/nuevo?vin=9BVRG40C5PE923007&patente=SHXB49&pais=CL&marca=Volvo&modelo=FH');
  });
});
