import { describe, expect, it } from 'vitest';
import { avanzarSchema } from '@/modules/logistica/domain/operacion.schemas';

describe('migración 217 · odómetro al entregar', () => {
  const base = { servicioId: 6194, paso: 'entrego' as const, momento: '', odometroKm: '263.086', detalle: '' };
  it('el odómetro de salida es opcional y se escribe a la manera local', () => {
    expect(avanzarSchema.parse(base).odometroSalidaKm).toBeNull();
    expect(avanzarSchema.parse({ ...base, odometroSalidaKm: '' }).odometroSalidaKm).toBeNull();
    const d = avanzarSchema.parse({ ...base, odometroSalidaKm: '262.100,5' });
    expect(d.odometroSalidaKm).toBe(262100.5);
    expect(d.odometroKm).toBe(263086);
  });
  it('no acepta un odómetro de salida inválido', () => {
    expect(avanzarSchema.safeParse({ ...base, odometroSalidaKm: 'abc' }).success).toBe(false);
    expect(avanzarSchema.safeParse({ ...base, odometroSalidaKm: '0' }).success).toBe(false);
  });
});
