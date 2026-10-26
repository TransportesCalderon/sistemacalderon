import { describe, expect, it } from 'vitest';
import { enlaceAlta, haceTexto, minutosDesde, paisDePatente, patenteDeNombre, senalDe } from '@/modules/telemetria/domain/flota.types';
import { estadoEquipo, parsearPanelTrackerway } from '@/modules/telemetria/domain/trackerway.types';

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

describe('telemetría: equipos de Trackerway (migración 72)', () => {
  const panel = parsearPanelTrackerway({
    credenciales: true,
    tarea: false,
    ultima: null,
    equipos: [
      { imei: '1', nombre: 'Mercedes', camion_id: 5, patente: 'ABCD12', importa: true, otra_api: null, ultimo_dato: '2026-10-23T10:00:00Z' },
      { imei: '2', nombre: 'Renault', camion_id: 6, patente: 'EFGH34', importa: false, otra_api: 'renault', ultimo_dato: null },
      { imei: '3', nombre: 'Auto', camion_id: null, patente: null, importa: false, otra_api: null, ultimo_dato: null },
      { imei: '4', nombre: 'Scania', camion_id: 7, patente: 'IJKL56', importa: false, otra_api: null, ultimo_dato: null },
    ],
    camiones: [{ id: 5, patente: 'ABCD12', codigo_interno: 'T-5', otra_api: false }],
  });
  it('lee el panel de la base', () => {
    expect(panel.credenciales).toBe(true);
    expect(panel.equipos).toHaveLength(4);
    expect(panel.camiones[0]).toEqual({ id: 5, patente: 'ABCD12', codigoInterno: 'T-5', otraApi: false });
  });
  it('estado de cada equipo', () => {
    expect(panel.equipos.map(estadoEquipo)).toEqual(['se_trae', 'llega_por_otra', 'sin_enlazar', 'no_se_trae']);
  });
  it('panel vacío', () => {
    expect(parsearPanelTrackerway(null)).toEqual({ credenciales: false, tarea: false, ultima: null, equipos: [], camiones: [] });
  });
});
