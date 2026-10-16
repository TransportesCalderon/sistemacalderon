import { describe, expect, it } from 'vitest';
import { aprobarSegmentoSchema, controlBaseSchema, movimientoBaseSchema } from '@/modules/combustible/domain/base.schemas';

const ts = '2026-10-16T12:00:00.000Z';

describe('Base Mendoza: formularios (solo forma)', () => {
  it('control: litros con coma decimal y cero permitido', () => {
    const r = controlBaseSchema.parse({
      depositoId: 1,
      fechaHora: ts,
      litros: '3950,5',
      metodo: 'varilla',
      observaciones: '',
      reemplazaId: null,
      motivoReemplazo: '',
    });
    expect(r.litros).toBe(3950.5);
    expect(r.observaciones).toBeNull();
    expect(
      controlBaseSchema.parse({
        depositoId: 1,
        fechaHora: ts,
        litros: '0',
        metodo: 'varilla',
        observaciones: '',
        reemplazaId: null,
        motivoReemplazo: '',
      }).litros,
    ).toBe(0);
  });

  it('control: corregir pide el motivo; sin fecha válida, marca la fecha', () => {
    const sinMotivo = controlBaseSchema.safeParse({
      depositoId: 1,
      fechaHora: ts,
      litros: '10',
      metodo: 'varilla',
      observaciones: '',
      reemplazaId: 5,
      motivoReemplazo: ' ',
    });
    expect(sinMotivo.success).toBe(false);
    expect(sinMotivo.error?.issues[0]?.path).toEqual(['motivoReemplazo']);
    const sinFecha = controlBaseSchema.safeParse({
      depositoId: 1,
      fechaHora: '',
      litros: '10',
      metodo: 'varilla',
      observaciones: '',
      reemplazaId: null,
      motivoReemplazo: '',
    });
    expect(sinFecha.error?.issues[0]?.path).toEqual(['fechaHora']);
  });

  it('movimiento con motivo: litros positivos y categoría del catálogo', () => {
    const base = { depositoId: 1, fechaHora: ts, motivo: 'Compra YPF', evidencia: 'R-1' };
    expect(movimientoBaseSchema.parse({ ...base, categoria: 'compra_granel', litros: '1000' }).litros).toBe(1000);
    expect(movimientoBaseSchema.safeParse({ ...base, categoria: 'compra_granel', litros: '0' }).success).toBe(false);
    expect(movimientoBaseSchema.safeParse({ ...base, categoria: 'ajuste', litros: '10' }).success).toBe(false);
  });

  it('aprobar segmento: no imputable vacío es 0', () => {
    expect(aprobarSegmentoSchema.parse({ controlId: 3, justificacion: '', noImputableL: '', noImputableMotivo: '' })).toEqual({
      controlId: 3,
      justificacion: null,
      noImputableL: 0,
      noImputableMotivo: null,
    });
  });
});
