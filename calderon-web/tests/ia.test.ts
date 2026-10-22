import { describe, expect, it } from 'vitest';
import { iaRepository } from '@/modules/ia/ia.repository';

describe('lectura con IA (migración 64)', () => {
  it('si la base no contesta el estado, la IA se toma como apagada (no aparece el botón)', async () => {
    const db = { schema: () => ({ rpc: async () => ({ data: null, error: { message: 'x' } }) }) } as never;
    expect(await iaRepository(db).estado()).toBe(false);
  });
  it('lee el resultado tal como lo arma la base', async () => {
    const data = { id: 4, estado: 'lista', propuesta: { litros: 250.5, estacion_id: 3 }, avisos: ['ojo'], reutilizada: true };
    const db = { schema: () => ({ rpc: async () => ({ data, error: null }) }) } as never;
    const r = await iaRepository(db).resultado(4);
    expect(r.propuesta?.litros).toBe(250.5);
    expect(r.avisos).toEqual(['ojo']);
    expect(r.reutilizada).toBe(true);
  });
});
