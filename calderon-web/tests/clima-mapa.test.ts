import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  climaCercano,
  colorPrecipitacion,
  colorTemperatura,
  colorViento,
  deDonde,
  parsearClima,
  redondearZona,
  textoClima,
} from '@/modules/telemetria/domain/clima.types';

const datos = parsearClima({
  paso: 0.25,
  horas: ['2026-11-04T15:00Z', '2026-11-04T16:00Z'],
  puntos: [
    { lat: -32.75, lng: -69.5, v: [45, 30], d: [270, 250], r: [70, 50], p: [0, 2.5], n: [0, 0], t: [-2, 4] },
    { lat: -33, lng: -68.75, v: [10, 12], d: [90, 90], r: [20, 20], p: [0, 0], n: [1.2, 0], t: [12, 14] },
  ],
  error: null,
});

describe('clima en el mapa (migración 182)', () => {
  it('lee la grilla que manda la base', () => {
    expect(datos.puntos).toHaveLength(2);
    expect(datos.puntos[0]).toMatchObject({ viento: [45, 30], direccion: [270, 250], temperatura: [-2, 4] });
    expect(parsearClima(null)).toEqual({ paso: 0, horas: [], puntos: [], error: null });
  });

  it('colores: viento por fuerza, lluvia y nieve, heladas', () => {
    expect(colorViento(10)).toBe('#16a34a');
    expect(colorViento(65)).toBe('#dc2626');
    expect(colorPrecipitacion(0, 0)).toBeNull();
    expect(colorPrecipitacion(2.5, 0)).toBe('#3b82f6');
    expect(colorPrecipitacion(0, 1.2)).toBe('#7c3aed');
    expect(colorTemperatura(-2)).toBe('#6366f1');
  });

  it('dice de dónde viene el viento y arma el texto del punto', () => {
    expect(deDonde(270)).toBe('del oeste');
    expect(deDonde(359)).toBe('del norte');
    expect(textoClima(datos.puntos[0]!, 0)).toBe('Viento 45 km/h del oeste (ráfagas 70) · -2 °C (helada)');
    expect(textoClima(datos.puntos[1]!, 0)).toContain('nieve 1,2 cm');
  });

  it('el camión toma el punto de la grilla más cercano (si está cerca)', () => {
    expect(climaCercano(datos, -32.8, -69.45)?.lat).toBe(-32.75);
    expect(climaCercano(datos, -20, -60)).toBeNull();
    expect(climaCercano(null, -32.8, -69.45)).toBeNull();
  });

  it('la zona se redondea a medio grado (mover un poco el mapa no vuelve a pedir)', () => {
    expect(redondearZona({ sur: -33.3, oeste: -70.2, norte: -32.1, este: -68.7 })).toEqual({ sur: -33.5, oeste: -70.5, norte: -32, este: -68.5 });
  });

  it('el mapa tiene las capas y la barra de horas; la clave no llega al navegador', () => {
    const c = readFileSync('src/modules/telemetria/components/mapa-flota.tsx', 'utf8');
    expect(c).toContain('BarraClima');
    expect(c).toContain('iniciarVientoAnimado');
    expect(c).not.toMatch(/open-meteo\.com|apikey/i);
  });
});

describe('viento animado (ráfagas)', () => {
  it('el vector apunta hacia donde sopla y se interpola entre los puntos de la grilla', async () => {
    const { vectorViento, grillaViento, vientoEn, colorEscalaViento } = await import('@/modules/telemetria/domain/clima.types');
    const w = vectorViento(40, 270); // viene del oeste → sopla hacia el este
    expect(Math.round(w.u)).toBe(40);
    expect(Math.round(w.v)).toBe(0);
    const g = grillaViento(
      parsearClima({
        paso: 1,
        horas: ['x'],
        puntos: [
          { lat: -33, lng: -70, v: [20], d: [270] },
          { lat: -33, lng: -69, v: [40], d: [270] },
          { lat: -32, lng: -70, v: [20], d: [270] },
          { lat: -32, lng: -69, v: [40], d: [270] },
        ],
      }),
      0,
    );
    expect(Math.round(vientoEn(g, -32.5, -69.5)!.u)).toBe(30);
    expect(vientoEn(g, -10, -50)).toBeNull();
    expect(colorEscalaViento(0)).toEqual([37, 52, 148]);
    expect(colorEscalaViento(100)).toEqual([215, 48, 39]);
  });
});
