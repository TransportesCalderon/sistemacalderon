import { describe, expect, it } from 'vitest';
import { parsearInterpretacion, parsearPendientesTablero, parsearTablerosCarga } from '@/modules/telemetria/domain/tablero.types';

describe('migración 224 · tablero en el inicio de viaje', () => {
  it('la interpretación trae cada conclusión con su tono', () => {
    const i = parsearInterpretacion({
      viaje: 'VC-000609', alertas: 1,
      conclusiones: [
        { tono: 'alerta', tema: 'odometro', texto: 'El odómetro de la foto (101.500 km) no coincide…' },
        { tono: 'ok', tema: 'km', texto: 'Coinciden.' },
        { tono: 'raro', tema: 'x', texto: 'y' },
      ],
    });
    expect(i?.alertas).toBe(1);
    expect(i?.conclusiones.map((c) => c.tono)).toEqual(['alerta', 'ok', 'info']);
    expect(parsearInterpretacion(null)).toBeNull();
  });

  it('las fotos de una carga con el odómetro leído y su interpretación', () => {
    const t = parsearTablerosCarga({
      carga_id: 5, camion_id: 2, odometro_carga: null, odometro_foto: 101000,
      tableros: [{ id: 9, camion_id: 2, tomada_en: '2026-11-10T10:00:00Z', odometro_km: 101000, km: 1000, litros: 301, interpretacion: { alertas: 0, conclusiones: [] } }],
    });
    expect(t).toMatchObject({ cargaId: 5, odometroCarga: null, odometroFoto: 101000 });
    expect(t.tableros[0]).toMatchObject({ id: 9, odometro_km: 101000, km: 1000 });
    expect(t.tableros[0]?.interpretacion?.alertas).toBe(0);
  });

  it('lo que le falta mandar al chofer', () => {
    expect(parsearPendientesTablero([{ carga_id: 3, patente: 'SXXV29', fecha_hora: '2026-11-10T09:41:00Z', litros: 300 }])[0]).toEqual({
      cargaId: 3, patente: 'SXXV29', fechaHora: '2026-11-10T09:41:00Z', litros: 300,
    });
  });
});
