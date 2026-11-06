import { describe, expect, it } from 'vitest';
import { parsearControles, parsearTramo, parsearViajesEnCurso } from '@/modules/telemetria/domain/seguimiento.types';

describe('migración 197 · seguimiento: litros automáticos y «desde»', () => {
  it('si faltan los litros, la base dice por qué y la web lo muestra tal cual', () => {
    const [v] = parsearViajesEnCurso([
      { viaje_id: 1, patente: 'GCSC92', km: 2771, litros: null, con_telemetria: false, motivo_sin_litros: 'La telemetría de este camión no está mandando el contador de combustible…', evaluacion: {} },
    ]);
    expect(v?.motivoSinLitros).toMatch(/no está mandando el contador/);
  });

  it('el tramo desde un momento trae sus números, la evaluación y el mensaje', () => {
    const t = parsearTramo({
      desde: '2026-11-05T20:00:00+00:00',
      km: 450,
      litros: 123.8,
      programador_pct: 95,
      con_telemetria: true,
      motivo_sin_litros: null,
      evaluacion: { resultado: 'a_mejorar', l_100km: 27.5, mensaje: 'Buenas tardes Lucas, actualizamos su viaje. Desde el 05/11 a las 17:00…' },
    });
    expect(t).toMatchObject({ km: 450, litros: 123.8, conTelemetria: true, motivoSinLitros: null });
    expect(t.evaluacion.mensaje).toContain('Desde el 05/11 a las 17:00');
  });

  it('el historial muestra desde cuándo se midió cada control', () => {
    const [a, b] = parsearControles([
      { id: 2, desde: '2026-11-05T20:00:00+00:00', resultado: 'bien', mensaje: 'x' },
      { id: 1, desde: null, resultado: 'bien', mensaje: 'y' },
    ]);
    expect(a?.desde).toBe('2026-11-05T20:00:00+00:00');
    expect(b?.desde).toBeNull();
  });
});
