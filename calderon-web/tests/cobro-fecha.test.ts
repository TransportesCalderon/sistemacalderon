import { describe, expect, it } from 'vitest';
import { cambiarFechaCobroSchema as deVentas } from '@/modules/ventas/domain/ventas.schemas';
import { cambiarFechaCobroSchema as deFinanzas } from '@/modules/finanzas/domain/finanzas.schemas';

/** Migración 273 · Cambiar la fecha de un cobro ya registrado. */
describe('cambiar la fecha de un cobro', () => {
  for (const [nombre, schema] of [['Ventas', deVentas], ['Finanzas', deFinanzas]] as const) {
    it(`${nombre}: pide fecha y motivo`, () => {
      expect(schema.safeParse({ id: 5, fecha: '2026-10-20', motivo: 'Era de octubre' }).success).toBe(true);
      expect(schema.safeParse({ id: 5, fecha: '2026-10-20', motivo: '  ' }).success).toBe(false);
      expect(schema.safeParse({ id: 5, fecha: '20/10/2026', motivo: 'x' }).success).toBe(false);
    });
  }
});
