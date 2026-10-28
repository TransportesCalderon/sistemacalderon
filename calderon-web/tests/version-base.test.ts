import { describe, expect, it } from 'vitest';
import { baseTiene, leerVersionBase } from '@/shared/lib/version-base';

/** Sprint 0 · T05: interruptor de funciones nuevas según la migración aplicada en la base. */
describe('versión de la base (Sprint 0 · T05)', () => {
  it('lee el número que devuelve ref.fn_version_base', () => {
    expect(leerVersionBase(113)).toBe(113);
    expect(leerVersionBase('114')).toBe(114);
  });

  it('cualquier otra cosa vale 0: lo nuevo queda apagado', () => {
    for (const v of [null, undefined, 'abc', -3, 1.5, {}, NaN]) expect(leerVersionBase(v), String(v)).toBe(0);
  });

  it('prende con la misma migración o una posterior, y apaga con una anterior', () => {
    expect(baseTiene(0, 114)).toBe(false);
    expect(baseTiene(113, 114)).toBe(false);
    expect(baseTiene(114, 114)).toBe(true);
    expect(baseTiene(120, 114)).toBe(true);
  });
});
