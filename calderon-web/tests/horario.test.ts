import { describe, expect, it } from 'vitest';
import { estadoFueraHorario, habilitarHorarioSchema, parsearFueraHorario } from '@/modules/telemetria/domain/horario.types';

/** Migración 286 · Horario de manejo (5:30 a 22:00) y habilitación fuera de horario. */
describe('horario de manejo', () => {
  it('lee lo que devuelve la base', () => {
    const d = parsearFueraHorario({
      activo: true, desde: '5:30', hasta: '22:00', en_horario: false, noche: '2026-11-20', proxima: '2026-11-20', puede_habilitar: true,
      circulando: [
        { id: 1, camion_id: 7, patente: 'AB123CD', chofer: 'Pérez, Juan', desde: '2026-11-21T01:05:00Z', ultimo_ts: '2026-11-21T02:05:00Z', velocidad_kmh: '78.0', avisado_en: '2026-11-21T01:06:00Z', escalado_en: '2026-11-21T02:06:00Z', veces: 1 },
        { id: 2, camion_id: 8, patente: 'XY999ZZ', habilitado: true },
        { patente: 'sin id' },
      ],
      habilitados: [{ id: 3, camion_id: 8, patente: 'XY999ZZ', noche: '2026-11-20', motivo: 'Turno a las 6', por: 'Andrés Calderón' }],
      tractores: [{ id: 7, patente: 'AB123CD' }],
    });
    expect(d.circulando).toHaveLength(2);
    expect(d.circulando[0]).toMatchObject({ velocidadKmh: 78, chofer: 'Pérez, Juan' });
    expect(estadoFueraHorario(d.circulando[0]!)).toEqual({ texto: 'Avisado a Gerencia', tono: 'error' });
    expect(estadoFueraHorario(d.circulando[1]!).texto).toBe('Habilitado');
    expect(d.habilitados[0]).toMatchObject({ motivo: 'Turno a las 6', por: 'Andrés Calderón' });
    expect(parsearFueraHorario(null)).toMatchObject({ circulando: [], puedeHabilitar: false, desde: '5:30', hasta: '22:00' });
  });

  it('pide el motivo para habilitar', () => {
    expect(habilitarHorarioSchema.safeParse({ camionId: 7, motivo: 'ok' }).success).toBe(false);
    expect(habilitarHorarioSchema.safeParse({ camionId: 7, motivo: 'Turno de descarga a las 6' }).success).toBe(true);
  });
});
